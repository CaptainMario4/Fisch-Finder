import snapshot from '../data/rods-snapshot.json';
import { extractRodObtainment, rodQuestReferences } from './rod-obtainment';
import type { RodObtainment, ObtainRef } from './rod-obtainment';

const API = 'https://fischipedia.org/w/api.php';
const fields = ['page_id','page_name','journal','event','source','quest','price','price_type','level','stage','lure','luck','control','resilience','max_weight','durability','disturbance','hunt_focus','pref_disturb','line_dist','is_unob','is_removed','description','hint'];
const ROD_QUERY = `mw.bucket('rods').select(${fields.map(field => `'${field}'`).join(',')}).limit(5000):run()`;
type RawRod = Record<string, unknown>;
export type Recommendation = { group: 'Optimal grinding' | 'Miscellaneous' | 'Keeperbound'; text: string; note: string; enchants: string[] };
export type RodAbility = { category: string; text: string; details: string[]; note: string };
export type RodMastery = { name: string; objective: string; reward: string; note: string };
export type Rod = {
  secondary?: import('./secondary-source').SecondarySource;
  id: number; page: string; name: string; url: string; stage: string; region: string;
  source: string; quest: string; event: string; price: string; level: string;
  lure: string; luck: string; control: string; resilience: string; maxWeight: string;
  durability: string; disturbance: string; huntFocus: string; lineDistance: string;
  description: string; hint: string; unavailable: boolean; recommendations: Recommendation[];
  abilities?: RodAbility[]; mastery?: RodMastery[]; masteryLevel?: string;
  obtainment?: RodObtainment; questReferences?: ObtainRef[];
};
export type RodDataset = { rods: Rod[]; fetchedAt: string; mode: 'api' | 'snapshot'; notice: string; secondaryData?: import('./secondary-source').SecondaryStatus };
type RecommendationSource = { revision: number; recommendations: Recommendation[]; abilities?: RodAbility[]; mastery?: RodMastery[]; masteryLevel?: string; obtainment?: RodObtainment };
type Sources = Record<string, RecommendationSource>;

// Split template arguments only at their own nesting level. Enchant advice often
// contains nested Enchantment templates, links, and conditional mastery notes.
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
export function wikiText(value: unknown): string {
  let result = String(value ?? '').replace(/<!--[\s\S]*?-->/g, '');
  const templates = templatesIn(result);
  for (const entry of templates.reverse()) {
    const parts = argumentsOf(entry.body), name = parts.shift()?.trim().toLowerCase() ?? '';
    const args = Object.fromEntries(parts.filter(part => /^\s*\w+\s*=/.test(part)).map(part => { const at = part.indexOf('='); return [part.slice(0, at).trim(), part.slice(at + 1)]; }));
    const first = parts.find(part => !/^\s*\w+\s*=/.test(part)) ?? args['1'] ?? '';
    const rendered = name === 'c$' ? `C$ ${wikiText(first)}` : name === 'robux' ? `${wikiText(first)} Robux` : name === 'f' || name.startsWith('#') || ['getrodstat','pagename','main','see also'].includes(name) ? '' : wikiText(args.text ?? first);
    result = result.slice(0, entry.start) + rendered + result.slice(entry.end);
  }
  return result.replace(/\[\[([^\]]+)\]\]/g, (_, body: string) => { const parts = body.split('|'); return /^(file|image):/i.test(parts[0]) ? '' : parts[parts.length - 1]; })
    .replace(/\[(https?:\/\/\S+)\s+([^\]]+)\]/g, '$2').replace(/<br\s*\/?\s*>/gi, ' ')
    .replace(/<[^>]*>/g, '').replace(/'{2,5}/g, '').replace(/&(?:nbsp|thinsp);/g, ' ')
    .replace(/&(?:mdash|ndash);/g, '—').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, number: string) => String.fromCodePoint(Math.min(Number(number), 0x10ffff)))
    .replace(/[{}]/g, '').replace(/\s+/g, ' ').trim();
}
export function extractRecommendations(wikitext: string): Recommendation[] {
  const template = templatesIn(wikitext.replace(/<!--[\s\S]*?-->/g, '')).find(entry => /^\s*Enchanting\s*\|/i.test(entry.body));
  if (!template) return [];
  const args: Record<string, string> = {};
  for (const part of argumentsOf(template.body).slice(1)) {
    const at = part.indexOf('='); if (at >= 0) args[part.slice(0, at).trim()] = part.slice(at + 1).trim();
  }
  const recommendations: Recommendation[] = [];
  for (const [prefix, group] of [['optimal','Optimal grinding'], ['misc','Miscellaneous'], ['keeper','Keeperbound']] as const) {
    for (let i = 1; i <= 5; i++) {
      const raw = args[prefix + i]; if (!raw) continue;
      const text = wikiText(raw), note = wikiText(args[prefix + 'note' + i]);
      const enchants = [...(raw + ' ' + (args[prefix + 'note' + i] ?? '')).matchAll(/\{\{Enchantment\s*\|\s*([^|}]+)/gi)].flatMap(match => match[1].split(',').map(wikiText));
      if (text) recommendations.push({ group, text, note, enchants: [...new Set(enchants.filter(Boolean))] });
    }
  }
  return recommendations;
}
function featureSection(value: string, heading: string) {
  const start = new RegExp(`^==\\s*(?:${heading})\\s*==\\s*$`, 'im').exec(value);
  if (!start) return '';
  const rest = value.slice(start.index + start[0].length), end = rest.search(/^==[^=].*?==\s*$/m);
  return end < 0 ? rest : rest.slice(0, end);
}
function featureArgs(body: string): Record<string,string> {
  return Object.fromEntries(argumentsOf(body).slice(1).flatMap(part => {
    const match = part.match(/^\s*([\w.-]+)\s*=([\s\S]*)$/);
    return match ? [[match[1].toLowerCase(), match[2].trim()]] : [];
  }));
}
function featureText(raw: string = ''): string {
  let value = raw;
  // Preserve quantities, conditional notes, and separate bullets in source text.
  for (const entry of templatesIn(value).reverse()) {
    const parts = argumentsOf(entry.body), name = parts.shift()?.trim().toLowerCase() ?? '';
    const args = featureArgs(entry.body), first = parts.find(p => !/^\s*[\w.-]+\s*=/.test(p)) ?? args['1'] ?? '';
    if (['fish','item','bait','rod'].includes(name)) {
      const quantity = args.x ?? (/^\d+(?:,\d{3})*$/.test(parts[1] ?? '') ? parts[1] : '');
      const text = [quantity ? `${quantity} ×` : '', args.attrs ? featureText(args.attrs) : '', featureText(args.text ?? first)].filter(Boolean).join(' ');
      value = value.slice(0,entry.start) + text + value.slice(entry.end);
    } else if (name === 'ref') value = value.slice(0,entry.start) + (first ? ` (Note: ${featureText(first)})` : '') + value.slice(entry.end);
    else if (name === 'reflist') value = value.slice(0,entry.start) + value.slice(entry.end);
  }
  return wikiText(value.replace(/^\s*[*#]+\s*/gm, ' • ').replace(/<br\s*\/?\s*>/gi, '; ')).replace(/&times;/g, '×').replace(/&quot;/g, '"');
}
export function extractRodFeatures(wikitext: string) {
  const clean = wikitext.replace(/<!--[\s\S]*?-->/g, '');
  const abilitySection = featureSection(clean, 'Ability|Abilities|Passive|Passives');
  const abilityTemplates = templatesIn(abilitySection).filter(t => /^\s*Ability\s*\|/i.test(t.body));
  const categories: Record<string,string> = { mutation:'Mutations', mechanic:'Fishing mechanics', unique:'Special effects', conditional:'Conditional effects', start:'At the start of a catch', progressspeed:'Progress speed', progress:'Progress', slash:'Slashes', money:'Weight & value', xp:'Experience', control:'Control', stat:'Stat effects', area:'Fishing areas', misc:'Other effects' };
  const abilities: RodAbility[] = [];
  for (const template of abilityTemplates) {
    const args = featureArgs(template.body);
    for (const [key,raw] of Object.entries(args)) {
      const match = key.match(/^([a-z]+)(\d+)$/);
      if (!match || match[1].endsWith('note') || /^(image|icon|color|optimal)$/.test(match[1])) continue;
      const text = featureText(raw); if (!text) continue;
      const details = Object.entries(args).filter(([name]) => name.startsWith(key + '.') && /^\d+$/.test(name.slice(key.length + 1))).sort(([a],[b]) => Number(a.slice(key.length + 1))-Number(b.slice(key.length + 1))).map(([,text]) => featureText(text)).filter(Boolean);
      abilities.push({ category: categories[match[1]] ?? 'Other effects', text, details, note: featureText(args[match[1]+'note'+match[2]]) });
    }
    const notes = featureText(args.notes); if (notes) abilities.push({category:'Notes',text:notes,details:[],note:''});
  }
  if (!abilityTemplates.length) {
    const prose = abilitySection.split(/\n\s*\n|\n(?=\s*\*[^*])/).map(featureText).filter(Boolean);
    for (const text of prose) abilities.push({category:'Passive effects',text,details:[],note:''});
  }
  const mastery: RodMastery[] = [];
  const template = templatesIn(featureSection(clean,'Mastery')).find(t => /^\s*Rod Mastery\s*\|/i.test(t.body));
  const args = template ? featureArgs(template.body) : {};
  const indexes = [...new Set(Object.keys(args).flatMap(key => key.match(/^(?:name|desc|reward|note)(\d+)$/)?.[1] ?? []))].sort((a,b)=>Number(a)-Number(b));
  for (const index of indexes) {
    const objective=featureText(args['desc'+index]), reward=featureText(args['reward'+index]), note=featureText(args['note'+index]);
    if (objective || reward || note) mastery.push({name:featureText(args['name'+index]) || `Mastery task ${index}`,objective,reward,note});
  }
  const grand = featureText(args.reward_grand), note = featureText(args.note_grand);
  if (grand || note) mastery.push({name:'Complete mastery',objective:'Complete the rod’s mastery tasks.',reward:grand,note});
  return { abilities, mastery, masteryLevel: featureText(args.level) };
}
const flag = (value: unknown) => value === '' || value === true || value === 1 || value === '1' || value === 'true';
export function normalizeRods(raw: RawRod[], sources: Sources): Rod[] {
  return raw.filter(rod => rod.page_id && rod.page_name).map(rod => {
    const value = (key: string) => wikiText(rod[key]);
    const percent = (key: string) => value(key) ? `${value(key)}${/%|inf|∞/i.test(value(key)) ? '' : '%'}` : '';
    const stage = value('stage');
    const rawPrice = value('price');
    const price = /^[\d,]+(?:\.\d+)?$/.test(rawPrice) ? Number(rawPrice.replace(/,/g, '')).toLocaleString('en-US', { maximumFractionDigits: 10 }) : rawPrice;
    return {
      id: Number(rod.page_id), page: String(rod.page_name), name: value('page_name'),
      url: 'https://fischipedia.org/wiki/' + encodeURIComponent(String(rod.page_name).replace(/ /g, '_')),
      stage: stage ? stage === '0' ? 'Stage 0 / Exclusive' : `Stage ${stage}` : 'Not listed',
      region: value('journal'), source: value('source'), quest: value('quest'), event: value('event'),
      questReferences: rodQuestReferences(rod.quest), obtainment: sources[String(rod.page_id)]?.obtainment,
      price: price ? value('price_type').toLowerCase().includes('robux') ? `${price} Robux` : value('price_type') ? `${price} ${value('price_type')}` : `C$ ${price}` : '',
      level: value('level'), lure: percent('lure'), luck: percent('luck'), control: value('control'), resilience: percent('resilience'), maxWeight: value('max_weight'),
      durability: value('durability'), disturbance: value('disturbance'), huntFocus: value('hunt_focus'), lineDistance: value('line_dist'),
      description: value('description'), hint: value('hint'), unavailable: flag(rod.is_unob) || flag(rod.is_removed),
      recommendations: sources[String(rod.page_id)]?.recommendations ?? [],
      abilities: sources[String(rod.page_id)]?.abilities ?? [], mastery: sources[String(rod.page_id)]?.mastery ?? [], masteryLevel: sources[String(rod.page_id)]?.masteryLevel ?? '',
    };
  }).sort((a, b) => a.name.localeCompare(b.name));
}
export const rodFallback: RodDataset = {
  rods: normalizeRods(snapshot.rods, snapshot.sources as Sources), fetchedAt: snapshot.fetchedAt,
  mode: 'snapshot', notice: 'Showing the saved rod data with its original source timestamp.',
};
let cache: RodDataset | undefined, expires = 0, lastAttempt = 0;
let sources: Sources = { ...snapshot.sources } as Sources;
let pending: Promise<RodDataset> | undefined;
async function request(params: Record<string, string>) {
  const url = new URL(API); url.search = new URLSearchParams({ ...params, format: 'json', formatversion: '2' }).toString();
  const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(18000), headers: { 'User-Agent': 'FischFinder/1.0 (Fischipedia companion; read-only)' } });
  if (!response.ok) throw new Error('Wiki HTTP ' + response.status);
  const payload = await response.json(); if (payload.error) throw new Error('Wiki API error'); return payload;
}
async function revisionPages(ids: number[], content: boolean): Promise<any[]> {
  const batches: number[][] = []; for (let i = 0; i < ids.length; i += 50) batches.push(ids.slice(i, i + 50));
  const pages: any[] = [];
  // At most two source requests at once. Only changed revisions need their text.
  for (let i = 0; i < batches.length; i += 2) {
    const responses = await Promise.all(batches.slice(i, i + 2).map(batch => request({ action: 'query', pageids: batch.join('|'), prop: 'revisions', rvprop: content ? 'ids|content' : 'ids', ...(content ? { rvslots: 'main' } : {}) })));
    for (const response of responses) { if (!Array.isArray(response.query?.pages)) throw new Error('Missing rod pages'); pages.push(...response.query.pages); }
  }
  if (pages.length !== ids.length || pages.some(page => !page.revisions?.[0]?.revid)) throw new Error('Incomplete rod pages');
  return pages;
}
export async function getRodDataset({ forceRefresh = false }: { forceRefresh?: boolean } = {}): Promise<RodDataset> {
  if (pending) return pending;
  if (cache && (Date.now() < lastAttempt + 60000 || !forceRefresh && Date.now() < expires)) return cache;
  lastAttempt = Date.now();
  pending = (async () => {
    try {
      const payload = await request({ action: 'bucket', query: ROD_QUERY });
      const raw: RawRod[] = payload.bucket;
      if (!Array.isArray(raw) || raw.length < (cache?.rods.length ?? snapshot.rods.length) * 0.7 || raw.length >= 5000 || raw.some(rod => !rod.page_id || !rod.page_name)) throw new Error('Incomplete rod data');
      const pages = await revisionPages(raw.map(rod => Number(rod.page_id)), false);
      const changed = pages.filter(page => sources[String(page.pageid)]?.revision !== page.revisions[0].revid || !Array.isArray(sources[String(page.pageid)]?.abilities) || !Array.isArray(sources[String(page.pageid)]?.mastery) || sources[String(page.pageid)]?.obtainment?.version!==2);
      const updated = { ...sources };
      if (changed.length) for (const page of await revisionPages(changed.map(page => page.pageid), true)) {
        const revision = page.revisions[0]; const content = revision.slots?.main?.content;
        if (typeof content !== 'string') throw new Error('Missing recommendation source');
        updated[String(page.pageid)] = { revision: revision.revid, recommendations: extractRecommendations(content), ...extractRodFeatures(content), obtainment: extractRodObtainment(content) };
      }
      sources = updated;
      cache = { rods: normalizeRods(raw, sources), fetchedAt: new Date().toISOString(), mode: 'api', notice: '' };
      expires = Date.now() + 30 * 60 * 1000; return cache;
    } catch {
      cache = { ...(cache ?? rodFallback), mode: 'snapshot', notice: 'Wiki refresh unavailable. Showing the last successfully retrieved rods and recommendations with their original timestamp.' };
      expires = Date.now() + 60000; return cache;
    } finally { pending = undefined; }
  })();
  return pending;
}
