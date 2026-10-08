import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parsePage, cleanText, PARSER_VERSION } from '../scripts/fandom-parser.mjs';
import { collect } from '../scripts/sync-fandom.mjs';
const license = { text: 'CC-BY-SA', url: 'https://www.fandom.com/licensing' };
const page = (title, text, id = 1) => ({ pageid: id, title, revisions: [{ revid: 3, timestamp: '2026-10-08T14:00:00Z', slots: { main: { content: text } } }] });
const fishText = '{{Fish|Fish_name={{PAGENAME}}|rarity={{ExoticF}}|location={{LocationColor|New Island}}|bait=[[Shark Head]]|time={{None}}|weather=Rain|season=Spring, Summer}}';
const rodText = '{{Fishing Rod|lure_speed={{Lure Speed|50%}}|luck={{Luck|0%}}|control={{Control|-0.02}}|resilience={{Resilience|15%}}|max_kg={{Maxkg|infkg}}}}';
test('real rod source retains zero stats, units, abilities, conditional enchants and unavailable category', () => {
  const raw = name => fs.readFileSync(new URL('./fixtures/fandom/' + name + '.txt', import.meta.url), 'utf8');
  const rod = parsePage('rod', page('Sunken Rod', raw('Sunken-Rod')), license);
  assert.equal(rod.maxWeight, '25,000'); assert.equal(rod.lure, '50%'); assert.equal(rod.control, '0.15');
  assert.ok(rod.abilities.some(a => /8%/.test(a.text) && /Sunken/.test(a.text)));
  assert.ok(rod.recommendations.some(r => r.enchants.includes('Herculean')));
  assert.ok(rod.recommendations.some(r => /Fabulous Deity/.test(r.text) && /Spectral Serpent/.test(r.text)));
  assert.ok(!JSON.stringify(rod).includes('{{'));
  const acid = parsePage('rod', page('Acidgrinder', raw('Acidgrinder')), license);
  assert.equal(acid.maxWeight, 'inf'); assert.equal(acid.unavailable, true);
  assert.ok(acid.abilities.some(a => /40%/.test(a.text) && /Acidic/.test(a.text)));
});
test('fish import distinguishes an explicit empty preference from a missing field; stubs and unresolved stats are excluded', () => {
  const fish = parsePage('fish', page('New Fish', fishText), license);
  assert.equal(fish.id, -1); assert.equal(fish.rarity, 'Exotic'); assert.deepEqual(fish.time, []);
  assert.deepEqual(fish.season, ['Spring', 'Summer']); assert.equal(fish.url, 'https://fisch.fandom.com/wiki/New_Fish');
  assert.equal(parsePage('fish', page('Missing', fishText.replace('|bait=[[Shark Head]]', '')), license), null);
  assert.equal(parsePage('fish', page('Stub', fishText + '{{Stub}}'), license), null);
  assert.equal(parsePage('rod', page('Bad', rodText.replace('infkg', '{{unknown stat}}')), license), null);
  assert.throws(() => cleanText('{{BoxStyle| broken'), /Unbalanced/);
});
test('incremental collection fetches only changed text and rejects incomplete results atomically', async () => {
  let contentCalls = 0, partial = false;
  const request = async p => {
    if (p.meta) return { query: { rightsinfo: license } };
    if (p.list) return { query: { categorymembers: Array.from({ length: p.cmtitle.endsWith(':Fish') ? 100 : 20 }, (_, i) => ({ pageid: (p.cmtitle.endsWith(':Fish') ? 1 : 1001) + i })) } };
    let ids = p.pageids.split('|').map(Number); if (partial) ids = ids.slice(1);
    if (p.rvprop.includes('content')) contentCalls++;
    return { query: { pages: ids.map(id => page('Entry ' + id, id < 1000 ? fishText : rodText, id)) } };
  };
  const first = await collect({}, request); assert.equal(first.fish.length, 100); assert.equal(first.rods.length, 20); assert.equal(first.parserVersion, PARSER_VERSION);
  assert.ok(contentCalls > 0); contentCalls = 0;
  const next = await collect(first, request); assert.equal(contentCalls, 0); assert.equal(next.fish.length, 100); assert.equal(next.rods.length, 20);
  partial = true; await assert.rejects(collect(first, request), /Incomplete revisions/);
  assert.equal(first.fish.length, 100, 'last successful dataset was not mutated');
});
