import bundled from '../data/fandom-secondary.json';
import type { Dataset, Fish } from './fisch';
import type { RodDataset, Rod } from './rods';
export type SecondarySource = { source: 'fandom'; pageId: number; revision: number; revisionAt: string; checkedAt?: string; license: string; licenseUrl: string };
export type SecondaryStatus = { source: 'fandom'; checkedAt: string; provisionalCount: number };
type SecondaryData = { schema: number; checkedAt: string; fish: Fish[]; rods: Rod[] };
const URL = 'https://raw.githubusercontent.com/CaptainMario4/Fisch-Finder/main/src/data/fandom-secondary.json';
const CACHE_MS = 30 * 60 * 1000;
export const identity = (value: string) => {
  const key = value.replace(/\s*\((?:fish|fishing rod|rod)\)\s*$/i, '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^\p{L}\p{N}\p{So}]/gu, '');
  // Explicit cross-wiki spelling difference for the Glitchstorm admin item.
  return key === 'glitchedcap' ? 'glitchcap' : key;
};
const text = (value: unknown): value is string => typeof value === 'string' && value.length <= 4000 && !/\{\{|\[\[|<[^>]+>/.test(value);
const strings = (value: unknown) => Array.isArray(value) && value.length <= 100 && value.every(text);
export function validEntry(entry: any, kind: 'fish' | 'rods', checkedAt: number): boolean {
  const source = entry?.secondary;
  if (!source || source.source !== 'fandom' || !Number.isInteger(source.pageId) || source.pageId <= 0 || entry.id !== -source.pageId || !Number.isInteger(source.revision) || source.revision <= 0 || !Number.isFinite(Date.parse(source.revisionAt)) || Date.parse(source.revisionAt) > checkedAt + 300000 || !text(source.license) || !/^(?:https:\/\/creativecommons\.org\/|https:\/\/www\.fandom\.com\/licensing$)/.test(source.licenseUrl)) return false;
  if (!text(entry.page) || !identity(entry.page) || !text(entry.name) || !identity(entry.name) || entry.url !== 'https://fisch.fandom.com/wiki/' + encodeURIComponent(entry.page.replace(/ /g, '_'))) return false;
  if (kind === 'fish') return ['rarity','region','location','event'].every(key => text(entry[key])) && !!entry.rarity && !!entry.location && ['bait','time','weather','season','methods','radar','locations','crabCages','adminEvents'].every(key => strings(entry[key])) && ['removed','unobtainable','nonfish'].every(key => typeof entry[key] === 'boolean');
  return ['stage','region','source','quest','event','price','level','lure','luck','control','resilience','maxWeight','durability','disturbance','huntFocus','lineDistance','description','hint','masteryLevel'].every(key => text(entry[key])) && typeof entry.unavailable === 'boolean'
    && Array.isArray(entry.recommendations) && entry.recommendations.length <= 30 && entry.recommendations.every((r: any) => ['Optimal grinding','Miscellaneous','Keeperbound'].includes(r.group) && text(r.text) && text(r.note) && strings(r.enchants))
    && Array.isArray(entry.abilities) && entry.abilities.length <= 30 && entry.abilities.every((a: any) => text(a.category) && text(a.text) && text(a.note) && strings(a.details))
    && Array.isArray(entry.mastery) && entry.mastery.length === 0;
}
export function validSecondary(data: any): data is SecondaryData {
  const checked = Date.parse(data?.checkedAt);
  return data?.schema === 1 && Number.isFinite(checked) && checked <= Date.now() + 300000
    && ['fish','rods'].every(kind => Array.isArray(data[kind]) && data[kind].length <= 5000 && new Set(data[kind].map((e: any) => e.id)).size === data[kind].length && data[kind].every((entry: any) => validEntry(entry, kind as 'fish' | 'rods', checked)));
}
let cache: SecondaryData | undefined = validSecondary(bundled) ? bundled as unknown as SecondaryData : undefined;
let expires = 0, pending: Promise<SecondaryData | undefined> | undefined;
export async function getSecondaryData(): Promise<SecondaryData | undefined> {
  if (pending) return pending;
  if (Date.now() < expires) return cache;
  pending = (async () => {
    try {
      const response = await fetch(URL, { signal: AbortSignal.timeout(4000) });
      if (!response.ok || Number(response.headers.get('content-length') || 0) > 5_000_000) throw new Error('Secondary cache unavailable');
      const body = await response.text(); if (body.length > 5_000_000) throw new Error('Secondary cache too large');
      const data = JSON.parse(body); if (!validSecondary(data)) throw new Error('Invalid secondary cache');
      if (!cache || Date.parse(data.checkedAt) >= Date.parse(cache.checkedAt)) cache = data;
      expires = Date.now() + CACHE_MS;
    } catch { expires = Date.now() + 5 * 60 * 1000; }
    finally { pending = undefined; }
    return cache;
  })();
  return pending;
}
// Primary objects, including intentional empty/None fields, remain untouched.
// The saved primary inventory also prevents removed primary entries resurfacing.
export function mergeEntries<T extends { page: string; name: string }>(primary: T[], secondary: T[], knownPrimary: T[] = []): T[] {
  const names = new Set([...primary, ...knownPrimary].flatMap(entry => [identity(entry.page), identity(entry.name)]).filter(Boolean));
  const added: T[] = [];
  for (const entry of secondary) {
    const keys = [identity(entry.page), identity(entry.name)].filter(Boolean);
    if (!keys.length || keys.some(key => names.has(key))) continue;
    added.push(entry); keys.forEach(key => names.add(key));
  }
  return added.length ? [...primary, ...added].sort((a, b) => a.name.localeCompare(b.name)) : primary;
}
const lastGood = new Map<string, Dataset | RodDataset>();
export async function withSecondary<T extends Dataset | RodDataset>(data: T, kind: 'fish' | 'rods', knownPrimary: Fish[] | Rod[]): Promise<T> {
  // A primary outage is not evidence that an entry is absent from Fischipedia.
  if (data.mode !== 'api') {
    const previous = lastGood.get(kind);
    return previous && Date.parse(previous.fetchedAt) >= Date.parse(data.fetchedAt) ? { ...previous, mode: data.mode, notice: data.notice } as T : data;
  }
  const secondary = await getSecondaryData();
  if (!secondary) return data;
  const primary = kind === 'fish' ? (data as Dataset).fish : (data as RodDataset).rods;
  const entries = mergeEntries(primary as (Fish | Rod)[], secondary[kind].map(entry => ({ ...entry, secondary: { ...entry.secondary!, checkedAt: secondary.checkedAt } })), knownPrimary);
  const count = entries.length - primary.length;
  const result = { ...data, [kind]: entries, secondaryData: { source: 'fandom', checkedAt: secondary.checkedAt, provisionalCount: count }, notice: count ? [data.notice, `${count} provisional Fisch Fandom ${kind === 'fish' ? 'fish entries' : 'rods'}. Secondary source checked: ${secondary.checkedAt.slice(0, 16).replace('T', ' ')} UTC. Fischipedia replaces matching entries when listed; secondary information is unverified.`].filter(Boolean).join(' ') : data.notice } as T;
  lastGood.set(kind, result); return result;
}
