import snapshot from '../data/fisch-snapshot.json';

export const API = 'https://fischipedia.org/w/api.php';
const FISH_QUERY = "mw.bucket('fish').select('page_id','page_name','name','rarity','bestiary','location','bait','time','weather','season','event','source','radar','is_unob','is_removed','nonfish').limit(5000):run()";
const AVAILABILITY_QUERY = "mw.bucket('fish_availability').select('page_id','page_name','locations','crab_cages','admin_events').limit(5000):run()";
export type Fish = {
  id: number; name: string; page: string; url: string; rarity: string;
  region: string; location: string; bait: string[]; time: string[];
  weather: string[]; season: string[]; event: string; methods: string[];
  radar: string[]; locations: string[]; crabCages: string[];
  adminEvents: string[]; removed: boolean; unobtainable: boolean; nonfish: boolean;
};
export type Dataset = { fish: Fish[]; fetchedAt: string; mode: 'api' | 'snapshot'; notice: string };
const text = (v: unknown): string => String(v ?? '').replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2').replace(/\[\[([^\]]+)\]\]/g, '$1').replace(/<[^>]*>/g, '').trim();
const list = (v: unknown): string[] => (Array.isArray(v) ? v : v == null ? [] : String(v).split(';')).map(text).filter(Boolean);
const lines = (v: unknown): string[] => String(v ?? '').split(/\r?\n/).map(text).filter(Boolean);
// The wiki stores admin events as "Event\\percentage;; Event\\percentage".
// Keep the source's percentage intact, but show one readable event per item.
const adminEvents = (v: unknown): string[] => (Array.isArray(v) ? v : [v])
  .flatMap(value => String(value ?? '').split(/;;|\r?\n/))
  .map(text)
  .filter(Boolean)
  .map(value => value.replace(/\s*\\\s*(\d+(?:\.\d+)?%)\s*$/, ' — $1'));
// MediaWiki's default JSON serializer emits true Boolean fields as an
// existing empty-string property, and omits false fields entirely.
const bool = (v: unknown) => v === '' || v === true || v === 1 || v === '1' || v === 'true';
export function normalize(raw: any[], availability: any[]): Fish[] {
  const byId = new Map(availability.map(a => [Number(a.page_id), a]));
  return raw.filter(f => f.page_id && f.page_name).map(f => {
    const a = byId.get(Number(f.page_id)) ?? {};
    return {
      id: Number(f.page_id), name: text(f.name || f.page_name), page: f.page_name,
      url: 'https://fischipedia.org/wiki/' + encodeURIComponent(f.page_name.replace(/ /g, '_')),
      rarity: text(f.rarity), region: text(f.bestiary), location: text(f.location),
      bait: list(f.bait), time: list(f.time), weather: list(f.weather), season: list(f.season),
      event: text(f.event), methods: list(f.source), radar: list(f.radar),
      locations: lines(a.locations), crabCages: lines(a.crab_cages),
      adminEvents: adminEvents(a.admin_events), removed: bool(f.is_removed),
      unobtainable: bool(f.is_unob), nonfish: bool(f.nonfish),
    };
  }).sort((a, b) => a.name.localeCompare(b.name));
}
export const fallback: Dataset = {
  fish: normalize(snapshot.fish, snapshot.availability), fetchedAt: snapshot.fetchedAt,
  mode: 'snapshot', notice: 'Showing the saved wiki data. The latest API data could not be retrieved.',
};
let cache: Dataset | undefined;
let expires = 0;
let lastAttempt = 0;
let pending: Promise<Dataset> | undefined;
async function query(query: string) {
  const url = new URL(API);
  url.search = new URLSearchParams({ action: 'bucket', format: 'json', query }).toString();
  const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(18000), headers: { 'User-Agent': 'FischFinder/1.0 (Fischipedia companion; read-only)' } });
  if (!response.ok) throw new Error('Wiki HTTP ' + response.status);
  const payload = await response.json();
  if (!Array.isArray(payload.bucket) || payload.bucket.length === 0 || payload.bucket.length >= 5000) throw new Error('Unexpected wiki response');
  return payload.bucket;
}
export async function getDataset({ forceRefresh = false }: { forceRefresh?: boolean } = {}): Promise<Dataset> {
  if (pending) return pending;
  if (cache && (Date.now() < lastAttempt + 60 * 1000 || (!forceRefresh && Date.now() < expires))) return cache;
  lastAttempt = Date.now();
  pending = (async () => {
    try {
      const [raw, available] = await Promise.all([query(FISH_QUERY), query(AVAILABILITY_QUERY)]);
      // Never silently replace a valid database with a severely incomplete response.
      if (raw.length < snapshot.fish.length * 0.7) throw new Error('Incomplete wiki response');
      cache = { fish: normalize(raw, available), fetchedAt: new Date().toISOString(), mode: 'api', notice: '' };
      expires = Date.now() + 30 * 60 * 1000;
      return cache;
    } catch {
      const previous = cache ?? fallback;
      cache = { ...previous, mode: 'snapshot', notice: 'Wiki refresh unavailable. Showing the last successfully retrieved data with its original timestamp.' };
      expires = Date.now() + 60 * 1000;
      return cache;
    } finally { pending = undefined; }
  })();
  return pending;
}
