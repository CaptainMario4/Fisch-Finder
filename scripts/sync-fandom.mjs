import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { PARSER_VERSION, parsePage } from './fandom-parser.mjs';
const output = 'src/data/fandom-secondary.json';
const API = 'https://fisch.fandom.com/api.php';
export async function collect(previous = {}, request = apiRequest) {
  const records = {}, fish = [], rods = []; let calls = 0;
  const read = async params => { if (++calls > 160) throw new Error('Request budget exceeded'); return request(params); };
  const site = await read({ action: 'query', meta: 'siteinfo', siprop: 'rightsinfo' });
  const rights = site.query?.rightsinfo;
  if (!rights?.text || !/^https?:\/\//.test(rights.url)) throw new Error('Missing source license');
  const license = { text: rights.text, url: rights.url.replace(/^http:/, 'https:') };
  for (const [kind, category] of [['fish', 'Fish'], ['rod', 'Fishing Rods']]) {
    const members = []; let continuation = {}, seen = new Set();
    do {
      const payload = await read({ action: 'query', list: 'categorymembers', cmtitle: 'Category:' + category, cmnamespace: '0', cmlimit: '500', ...continuation });
      if (!Array.isArray(payload.query?.categorymembers)) throw new Error('Missing category data');
      members.push(...payload.query.categorymembers); continuation = payload.continue;
      if (continuation) { const key = JSON.stringify(continuation); if (seen.has(key)) throw new Error('Repeated continuation'); seen.add(key); }
      if (members.length > 5000) throw new Error('Unexpected category size');
    } while (continuation);
    const oldIds = Object.keys(previous.records ?? {}).filter(key => key.startsWith(kind + ':'));
    if (members.length < (kind === 'fish' ? 100 : 20) || members.length < oldIds.length * .7 || new Set(members.map(p => p.pageid)).size !== members.length) throw new Error('Incomplete ' + kind + ' listing');
    for (let i = 0; i < members.length; i += 50) {
      const batch = members.slice(i, i + 50), ids = batch.map(p => p.pageid);
      const response = await read({ action: 'query', prop: 'revisions', pageids: ids.join('|'), rvprop: 'ids|timestamp', rvslots: 'main' });
      const pages = response.query?.pages;
      if (!Array.isArray(pages) || pages.length !== ids.length || new Set(pages.map(p => p.pageid)).size !== ids.length || pages.some(p => !ids.includes(p.pageid) || !p.revisions?.[0]?.revid)) throw new Error('Incomplete revisions');
      const changed = pages.filter(p => previous.parserVersion !== PARSER_VERSION || previous.records?.[kind + ':' + p.pageid]?.revision !== p.revisions[0].revid || previous.records?.[kind + ':' + p.pageid]?.title !== p.title);
      const parsed = new Map();
      if (changed.length) {
        const data = await read({ action: 'query', prop: 'revisions', pageids: changed.map(p => p.pageid).join('|'), rvprop: 'ids|timestamp|content', rvslots: 'main' });
        const full = data.query?.pages;
        if (!Array.isArray(full) || full.length !== changed.length || new Set(full.map(p => p.pageid)).size !== changed.length || full.some(p => !changed.some(x => x.pageid === p.pageid) || typeof p.revisions?.[0]?.slots?.main?.content !== 'string')) throw new Error('Incomplete source content');
        for (const page of full) parsed.set(page.pageid, { revision: page.revisions[0].revid, title: page.title, entry: parsePage(kind, page, license) });
      }
      for (const p of pages) {
        const key = kind + ':' + p.pageid, record = parsed.get(p.pageid) ?? previous.records[key];
        records[key] = record;
        if (record.entry) (kind === 'fish' ? fish : rods).push(record.entry);
      }
    }
  }
  if (fish.length < 50 || rods.length < 10) throw new Error('Too few valid secondary entries');
  const sort = (a, b) => a.name.localeCompare(b.name, 'en'); fish.sort(sort); rods.sort(sort);
  return { schema: 1, parserVersion: PARSER_VERSION, checkedAt: new Date().toISOString(), license, fish, rods, records,
    stats: { discovered: Object.keys(records).length, accepted: fish.length + rods.length, skipped: Object.values(records).filter(r => !r.entry).length, requests: calls } };
}
async function apiRequest(params) {
  // Sequential, bounded requests; only changed revisions download article text.
  await new Promise(resolve => setTimeout(resolve, 500));
  const url = new URL(API); url.search = new URLSearchParams({ ...params, format: 'json', formatversion: '2', maxlag: '5' });
  const response = await fetch(url, { signal: AbortSignal.timeout(25000), headers: { 'User-Agent': 'FischFinderSecondary/1.0 (https://github.com/CaptainMario4/Fisch-Finder; read-only)' } });
  if (!response.ok) throw new Error('Fandom HTTP ' + response.status);
  const data = await response.json(); if (data.error) throw new Error('Fandom API: ' + data.error.code);
  return data;
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  let previous = {}; try { previous = JSON.parse(await fs.readFile(output, 'utf8')); } catch {}
  const next = await collect(previous);
  // Write atomically only after every category and revision check succeeds.
  await fs.mkdir('src/data', { recursive: true });
  await fs.writeFile(output + '.tmp', JSON.stringify(next) + '\n'); await fs.rename(output + '.tmp', output);
  console.log(JSON.stringify({ fish: next.fish.length, rods: next.rods.length, ...next.stats, checkedAt: next.checkedAt }));
}
