import snapshot from '../data/companions-snapshot.json';

const API = 'https://fischipedia.org/w/api.php';
const fields = ['page_id', 'page_name', 'name', 'location', 'event', 'source', 'food', 'is_unob'];
const QUERY = `mw.bucket('companions').select(${fields.map(field => `'${field}'`).join(',')}).limit(5000):run()`;
export const abilityGroups = ['Fishing support', 'Mutations', 'Utility', 'Conditional bonuses', 'XP / progression', 'Other effects'] as const;
export type AbilityGroup = typeof abilityGroups[number];
export type CompanionAbility = { group: AbilityGroup; text: string; details: string[]; notes: string[] };
export type CompanionBuff = { food: string; category: string; effect: string; level: string; type: string };
export type CompanionDetails = { description: string; abilities: CompanionAbility[]; notes: string; obtainment: string[]; buffs: CompanionBuff[]; gameplayNotes: string[] };
export type Companion = CompanionDetails & { id: number; page: string; name: string; url: string; region: string; event: string; source: string; food: string; unavailable: boolean };
export type CompanionDataset = { companions: Companion[]; fetchedAt: string; mode: 'api' | 'snapshot'; notice: string };
type RawCompanion = Record<string, unknown>;
type Sources = Record<string, { revision: number; details: CompanionDetails }>;

// Split on top-level pipes only: nested templates and wiki links can contain pipes.
function argumentsOf(value: string): string[] {
  const parts: string[] = []; let start = 0, templates = 0, links = 0;
  for (let i = 0; i < value.length; i++) {
    const pair = value.slice(i, i + 2);
    if (pair === '{{') { templates++; i++; }
    else if (pair === '}}') { templates--; i++; }
    else if (pair === '[[') { links++; i++; }
    else if (pair === ']]') { links--; i++; }
    else if (value[i] === '|' && !templates && !links) { parts.push(value.slice(start, i)); start = i + 1; }
  }
  parts.push(value.slice(start)); return parts;
}
function templatesIn(value: string) {
  const entries: { start: number; end: number; body: string }[] = [];
  let depth = 0, start = -1;
  for (let i = 0; i < value.length - 1; i++) {
    const pair = value.slice(i, i + 2);
    if (pair === '{{') { if (!depth) start = i; depth++; i++; }
    else if (pair === '}}' && depth) { depth--; i++; if (!depth) entries.push({ start, end: i + 1, body: value.slice(start + 2, i - 1) }); }
  }
  return entries;
}
export function companionWikiText(value: unknown): string {
  let result = String(value ?? '').replace(/<!--[\s\S]*?-->/g, '');
  for (const entry of templatesIn(result).reverse()) {
    const parts = argumentsOf(entry.body), name = parts.shift()?.trim().toLowerCase() ?? '';
    const args = Object.fromEntries(parts.filter(part => /^\s*[\w.]+\s*=/.test(part)).map(part => { const at = part.indexOf('='); return [part.slice(0, at).trim(), part.slice(at + 1)]; }));
    const first = parts.find(part => !/^\s*[\w.]+\s*=/.test(part)) ?? args['1'] ?? '';
    const rendered = ['reflist', 'main', 'see also', 'missing media', 'stub'].includes(name) || name.startsWith('#') ? ''
      : name === 'c$' || name === 's$' ? `${name.toUpperCase()}${first ? ' ' + companionWikiText(first) : ''}`
      : name === 'ref' ? ` (Note: ${companionWikiText(first)}) `
      : name === 'robux' ? `${companionWikiText(first)} Robux`
      : companionWikiText(args.text ?? first);
    result = result.slice(0, entry.start) + rendered + result.slice(entry.end);
  }
  return result.replace(/\[\[([^\]]+)\]\]/g, (_, body: string) => { const parts = body.split('|'); return /^(file|image):/i.test(parts[0]) ? '' : parts[parts.length - 1]; })
    .replace(/\[(https?:\/\/\S+)\s+([^\]]+)\]/g, '$2').replace(/<br\s*\/?\s*>/gi, ' ')
    .replace(/<[^>]*>/g, '').replace(/'{2,5}/g, '').replace(/&(?:nbsp|thinsp);/g, ' ')
    .replace(/&(?:mdash|ndash);/g, '—').replace(/&times;/g, '×').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, number: string) => String.fromCodePoint(Math.min(Number(number), 0x10ffff)))
    .replace(/^\s*\*+\s*/gm, ' • ').replace(/[{}]/g, '').replace(/\s+/g, ' ').trim();
}
function section(value: string, heading: string): string {
  const start = new RegExp(`^==\\s*${heading}\\s*==\\s*$`, 'im').exec(value);
  if (!start) return '';
  const remaining = value.slice(start.index + start[0].length);
  const end = remaining.search(/^==[^=].*?==\s*$/m);
  return end < 0 ? remaining : remaining.slice(0, end);
}
const emptyDetails = (): CompanionDetails => ({ description: '', abilities: [], notes: '', obtainment: [], buffs: [], gameplayNotes: [] });
export function extractCompanionDetails(wikitext: string): CompanionDetails {
  const cleaned = wikitext.replace(/<!--[\s\S]*?-->/g, '');
  const overview = section(cleaned, 'Overview');
  const descriptionTemplate = templatesIn(overview).find(entry => /^\s*Description\s*\|/i.test(entry.body));
  const description = descriptionTemplate ? companionWikiText(argumentsOf(descriptionTemplate.body).slice(1).join('|')) : '';
  const template = templatesIn(section(cleaned, 'Abilit(?:y|ies)')).find(entry => /^\s*Ability\s*\|/i.test(entry.body));
  const args: Record<string, string> = {};
  if (template) for (const part of argumentsOf(template.body).slice(1)) {
    const at = part.indexOf('='); if (at >= 0) args[part.slice(0, at).trim().toLowerCase()] = part.slice(at + 1).trim();
  }
  const groups: Record<string, AbilityGroup> = { mechanic: 'Fishing support', mutation: 'Mutations', unique: 'Utility', conditional: 'Conditional bonuses', xp: 'XP / progression', misc: 'Other effects' };
  const abilities: CompanionAbility[] = [];
  for (const [key, value] of Object.entries(args)) {
    const match = key.match(/^(mechanic|mutation|unique|conditional|xp|misc)(\d+)$/);
    if (!match) continue;
    const text = companionWikiText(value); if (!text) continue;
    const children = Object.entries(args).filter(([name]) => name.startsWith(key + '.')).map(([, raw]) => companionWikiText(raw)).filter(Boolean);
    const note = companionWikiText(args[match[1] + 'note' + match[2]]);
    abilities.push({ group: groups[match[1]], text, details: children, notes: note ? [note] : [] });
  }
  // The obtainment section may contain dialogue or tables; retain its prose and
  // requirement bullets, and link to the full page for extra material.
  const obtainment = section(cleaned, 'Obtainment').split(/^===/m)[0]
    .replace(/\{\|[\s\S]*?\|\}/g, '').split(/\n\s*\n|\n(?=\*)/)
    .map(paragraph => companionWikiText(paragraph.replace(/^\s*\*+\s*/gm, ''))).filter(Boolean);
  const buffs: CompanionBuff[] = [];
  const buffSection = overview.split(/^===\s*Buffs\s*===\s*$/m)[1]?.split(/^===/m)[0] ?? '';
  for (const row of buffSection.split(/\n\|-\s*\n/).slice(1)) {
    const cells = row.replace(/^\s*\|/, '').split('||').map(companionWikiText);
    if (cells.length === 5 && cells[0]) buffs.push({ food: cells[0], category: cells[1], effect: cells[2], level: cells[3], type: cells[4].replace(/\|}$/, '').trim() });
  }
  const gameplayNotes = section(cleaned, 'Gameplay Notes').split('\n').filter(line => /^\s*\*/.test(line)).map(line => companionWikiText(line.replace(/^\s*\*+\s*/, ''))).filter(Boolean);
  return { description, abilities, notes: companionWikiText(args.notes), obtainment, buffs, gameplayNotes };
}
const flag = (value: unknown) => value === '' || value === true || value === 1 || value === '1' || value === 'true';
export function normalizeCompanions(raw: RawCompanion[], sources: Sources): Companion[] {
  return raw.filter(item => item.page_id && item.page_name).map(item => ({
    ...(sources[String(item.page_id)]?.details ?? emptyDetails()),
    id: Number(item.page_id), page: String(item.page_name), name: companionWikiText(item.name || item.page_name),
    url: 'https://fischipedia.org/wiki/' + encodeURIComponent(String(item.page_name).replace(/ /g, '_')),
    region: companionWikiText(item.location), event: companionWikiText(item.event), source: companionWikiText(item.source), food: companionWikiText(item.food), unavailable: flag(item.is_unob),
  })).sort((a, b) => a.name.localeCompare(b.name));
}
export const companionFallback: CompanionDataset = {
  companions: normalizeCompanions(snapshot.companions, snapshot.sources as Sources), fetchedAt: snapshot.fetchedAt,
  mode: 'snapshot', notice: 'Showing saved companion data with its original source timestamp.',
};
let cache: CompanionDataset | undefined, expires = 0, lastAttempt = 0;
let sources: Sources = { ...snapshot.sources } as Sources;
let pending: Promise<CompanionDataset> | undefined;
async function request(params: Record<string, string>) {
  const url = new URL(API); url.search = new URLSearchParams({ ...params, format: 'json', formatversion: '2' }).toString();
  const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(18000), headers: { 'User-Agent': 'FischFinder/1.0 (read-only wiki viewer)' } });
  if (!response.ok) throw new Error('Wiki HTTP ' + response.status);
  const payload = await response.json(); if (payload.error) throw new Error('Wiki API error'); return payload;
}
async function revisionPages(ids: number[], content: boolean): Promise<any[]> {
  const batches: number[][] = []; for (let i = 0; i < ids.length; i += 50) batches.push(ids.slice(i, i + 50));
  const pages: any[] = [];
  for (let i = 0; i < batches.length; i += 2) {
    const responses = await Promise.all(batches.slice(i, i + 2).map(batch => request({ action: 'query', pageids: batch.join('|'), prop: 'revisions', rvprop: content ? 'ids|content' : 'ids', ...(content ? { rvslots: 'main' } : {}) })));
    for (const response of responses) { if (!Array.isArray(response.query?.pages)) throw new Error('Missing companion pages'); pages.push(...response.query.pages); }
  }
  if (pages.length !== ids.length || new Set(pages.map(page => page.pageid)).size !== ids.length || pages.some(page => !ids.includes(page.pageid) || !page.revisions?.[0]?.revid)) throw new Error('Incomplete companion pages');
  return pages;
}
export async function getCompanionDataset({ forceRefresh = false }: { forceRefresh?: boolean } = {}): Promise<CompanionDataset> {
  if (pending) return pending;
  if (cache && (Date.now() < lastAttempt + 60000 || !forceRefresh && Date.now() < expires)) return cache;
  lastAttempt = Date.now();
  pending = (async () => {
    try {
      const payload = await request({ action: 'bucket', query: QUERY });
      const raw: RawCompanion[] = payload.bucket;
      if (!Array.isArray(raw) || !raw.length || raw.length < (cache?.companions.length ?? snapshot.companions.length) * 0.7 || raw.length >= 5000 || raw.some(item => !Number.isFinite(Number(item.page_id)) || Number(item.page_id) <= 0 || !item.page_name) || new Set(raw.map(item => item.page_id)).size !== raw.length) throw new Error('Incomplete companion data');
      const pages = await revisionPages(raw.map(item => Number(item.page_id)), false);
      const changed = pages.filter(page => sources[String(page.pageid)]?.revision !== page.revisions[0].revid);
      const updated = { ...sources };
      if (changed.length) for (const page of await revisionPages(changed.map(page => page.pageid), true)) {
        const revision = page.revisions[0], content = revision.slots?.main?.content;
        if (typeof content !== 'string' || !/\{\{CompanionInfobox\b/i.test(content)) throw new Error('Missing companion source');
        updated[String(page.pageid)] = { revision: revision.revid, details: extractCompanionDetails(content) };
      }
      const companions = normalizeCompanions(raw, updated);
      sources = updated;
      cache = { companions, fetchedAt: new Date().toISOString(), mode: 'api', notice: '' };
      expires = Date.now() + 30 * 60 * 1000; return cache;
    } catch {
      cache = { ...(cache ?? companionFallback), mode: 'snapshot', notice: 'Wiki refresh unavailable. Showing the last successfully retrieved companions and abilities with their original timestamp.' };
      expires = Date.now() + 60000; return cache;
    } finally { pending = undefined; }
  })();
  return pending;
}
