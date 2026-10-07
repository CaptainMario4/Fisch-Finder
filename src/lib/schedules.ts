import snapshot from '../data/schedules-snapshot.json';

const API = 'https://fischipedia.org/w/api.php';
export const schedulePages = ['Template:Main page settings/events', 'Template:Main page settings/seasonal events', 'MediaWiki:Countdowns.js'];
export type HuntSchedule = { name: string; page: string; period: number; start: number; offset: number };
export type WikiEvent = { name: string; start: number; end: number };
export type ScheduleData = { hunts: HuntSchedule[]; events: WikiEvent[]; seasons: string[]; seasonDuration: number; fetchedAt: string; mode: 'api' | 'snapshot' };
const plain = (s: string) => s.replace(/<[^>]*>/g, '').replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2').replace(/\[\[([^\]]+)\]\]/g, '$1').trim();
export function seconds(value: string): number {
  if (!value.trim()) return 0;
  return value.trim().split(/\s+/).reduce((sum, part) => {
    const m = part.match(/^(-?\d+(?:\.\d+)?)([smhd]?)$/);
    if (!m) throw new Error('Unknown wiki duration');
    return sum + Number(m[1]) * ({ s: 1, m: 60, h: 3600, d: 86400, '': 1 }[m[2]]!);
  }, 0);
}
function templates(source: string, name: string) {
  const blocks = [...source.matchAll(new RegExp('\\{\\{' + name + '\\s*\\n([\\s\\S]*?)\\}\\}', 'g'))];
  return blocks.map(match => Object.fromEntries([...match[1].matchAll(/^\|\s*(\w+)\s*=\s*(.*)$/gm)].map(m => [m[1], m[2].trim()])));
}
export function parseSchedules(payload: any, fetchedAt: string, mode: ScheduleData['mode'] = 'api'): ScheduleData {
  const pages = Object.values(payload.query?.pages ?? {}) as any[];
  const content = (title: string) => {
    const source = pages.find(p => p.title === title)?.revisions?.[0]?.slots?.main?.['*'];
    if (typeof source !== 'string') throw new Error('Wiki schedule page missing');
    return source;
  };
  const hunts = templates(content(schedulePages[0]), 'Recurring Countdown').filter(b => /Global/.test(b.header ?? '')).map(b => {
    const page = b.header.match(/\[\[([^\]|]+)/)?.[1];
    const period = seconds(b.period ?? '');
    if (!page || period <= 0 || seconds(b.duration ?? '') !== 0) throw new Error('Unknown hunt schedule format');
    return { name: plain(b.header).replace(/^Global\s+/, '').replace(/\s+Spawn$/, ''), page, period, start: seconds(b.start ?? ''), offset: seconds(b.period_offset ?? '') };
  });
  if (!hunts.length) throw new Error('No hunt schedules');
  const events = templates(content(schedulePages[1]), 'Countdown').map(b => {
    const name = plain(b.header ?? '');
    const start = Date.parse(b.start ?? ''), end = Date.parse(b.end ?? '');
    if (!name || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) throw new Error('Unknown event date');
    return { name, start, end };
  });
  // Read only the documented values; never execute third-party wiki JavaScript.
  const script = content(schedulePages[2]);
  const minutes = Number(script.match(/const SEASON_DURATION\s*=\s*(\d+)\s*\*\s*MINUTE_SECONDS/)?.[1]);
  const map = script.match(/const SEASON_MAP\s*=\s*(\[[^\]]+\])/)?.[1];
  const seasons: string[] = map ? JSON.parse(map) : [];
  if (!minutes || seasons.join(',') !== 'Spring,Summer,Autumn,Winter' || !script.includes('Date.now()') || !/SEASON_DURATION \* 1000\)\) % 4/.test(script)) throw new Error('Unknown season clock');
  return { hunts, events, seasons, seasonDuration: minutes * 60, fetchedAt, mode };
}
export const scheduleFallback = parseSchedules(snapshot, snapshot.fetchedAt, 'snapshot');
export function nextHunt(hunt: HuntSchedule, now: number) {
  const period = hunt.period * 1000, origin = (hunt.offset + hunt.start) * 1000;
  return origin + (Math.floor((now - origin) / period) + 1) * period;
}
export function seasonAt(data: ScheduleData, now: number) {
  const duration = data.seasonDuration * 1000, index = Math.floor(now / duration);
  return { name: data.seasons[index % data.seasons.length], next: data.seasons[(index + 1) % data.seasons.length], endsAt: (index + 1) * duration };
}
export function eventAt(events: WikiEvent[], now: number) {
  return events.filter(e => e.end > now).sort((a, b) => a.start - b.start)[0];
}
export function countdown(target: number, now: number) {
  let remaining = Math.max(0, Math.ceil((target - now) / 1000));
  const days = Math.floor(remaining / 86400); remaining %= 86400;
  const hours = Math.floor(remaining / 3600); remaining %= 3600;
  const minutes = Math.floor(remaining / 60), secs = remaining % 60;
  return `${days ? days + 'd ' : ''}${hours}h ${String(minutes).padStart(2, '0')}m ${String(secs).padStart(2, '0')}s`;
}
let cached: ScheduleData | undefined, expires = 0, pending: Promise<ScheduleData> | undefined;
export async function getSchedules(force = false): Promise<ScheduleData> {
  if (pending) return pending;
  if (!force && cached && Date.now() < expires) return cached;
  pending = (async () => {
    try {
      const url = new URL(API);
      url.search = new URLSearchParams({ action: 'query', prop: 'revisions', rvprop: 'ids|timestamp|content', rvslots: 'main', format: 'json', titles: schedulePages.join('|') }).toString();
      const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(18000), headers: { 'User-Agent': 'FischFinder/1.0 (Fischipedia companion; read-only)' } });
      if (!response.ok) throw new Error('Wiki unavailable');
      cached = parseSchedules(await response.json(), new Date().toISOString());
      expires = Date.now() + 15 * 60 * 1000;
      return cached;
    } catch {
      cached = { ...(cached ?? scheduleFallback), mode: 'snapshot' };
      expires = Date.now() + 60 * 1000;
      return cached;
    } finally { pending = undefined; }
  })();
  return pending;
}
