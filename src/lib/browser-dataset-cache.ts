import { datasetVersion } from './dataset-version';
import { holdRefresh, refreshAvailableAt } from './refresh-cooldown';
import { isMainDataset, MANUAL_REFRESH_COOLDOWN } from './refresh-policy';
type PublicDataset = { fetchedAt: string; mode: string };
type Entry = { expiresAt: number; value: PublicDataset; etag?: string };
const memory = new Map<string, Entry>();
const keyFor = (url: string) => `fischfinder:dataset:v1:${url}`;
function valid<T extends PublicDataset>(value: unknown, validate: (value: T) => boolean): value is T {
  try { return !!value && typeof value === 'object' && Number.isFinite(Date.parse((value as T).fetchedAt)) && validate(value as T); }
  catch { return false; }
}
function stored(url: string): Entry | undefined {
  let entry = memory.get(keyFor(url));
  if (!entry) { try { entry = JSON.parse(window.sessionStorage.getItem(keyFor(url)) || 'null'); } catch { /* Private browsing may deny storage. */ } }
  // Retain expired successful data and its validator for conditional requests.
  return entry && Number.isFinite(entry.expiresAt) && entry.value ? entry : undefined;
}
function read(url: string): Entry | undefined {
  const entry = stored(url);
  return entry && entry.expiresAt > Date.now() ? entry : undefined;
}
function save(url: string, entry: Entry) {
  memory.set(keyFor(url), entry);
  try { window.sessionStorage.setItem(keyFor(url), JSON.stringify(entry)); } catch { /* Quota/storage errors never block rendering. */ }
}
function invalidatePage(url: string) {
  if (typeof document !== 'undefined' && typeof CustomEvent !== 'undefined') document.dispatchEvent(new CustomEvent('fischfinder:dataset-refreshed', { detail: url }));
}
/** Fresh initial data is reused; expired data validates an unchanged response. */
export async function fetchDataset<T extends PublicDataset>(
  url: string, options: { force: boolean; signal: AbortSignal; maxAge: number; initialData?: T }, validate: (value: T) => boolean,
): Promise<T> {
  if (options.signal.aborted) throw new DOMException('Aborted', 'AbortError');
  let cached = stored(url);
  const initial = options.initialData;
  if (valid<T>(initial, validate) && initial.mode === 'api' &&
      (!cached || !valid<T>(cached.value, validate) || Date.parse(initial.fetchedAt) > Date.parse(cached.value.fetchedAt))) {
    cached = { value: initial, expiresAt: Math.min(Date.now() + options.maxAge, Date.parse(initial.fetchedAt) + options.maxAge) };
    save(url, cached);
  }
  const previous = cached && valid<T>(cached.value, validate) ? cached.value : valid<T>(initial, validate) ? initial : undefined;
  if (!options.force && cached && previous?.mode === 'api' && cached.expiresAt > Date.now()) {
    const wait = Date.parse(previous.fetchedAt) + MANUAL_REFRESH_COOLDOWN - Date.now();
    if (wait > 0) holdRefresh(url, wait);
    return previous;
  }
  if (options.force && isMainDataset(url)) {
    if (refreshAvailableAt(url) > Date.now()) {
      if (previous) return previous;
      throw new Error('Refresh is cooling down');
    }
    // Reserve before sending; even a failed request cannot be spammed.
    holdRefresh(url);
  }
  let etag = cached?.etag;
  if (!etag && previous?.mode === 'api' && isMainDataset(url)) {
    try { etag = await datasetVersion(previous); } catch { /* Older browsers use a normal download. */ }
  }
  if (options.signal.aborted) throw new DOMException('Aborted', 'AbortError');
  const response = await fetch(url, { method: options.force ? 'POST' : 'GET', cache: 'no-store', signal: options.signal,
    ...(etag ? { headers: { 'If-None-Match': etag } } : {}),
  });
  const header = (name: string) => response.headers?.get(name) ?? null;
  const wait = Number(header('X-Refresh-Wait') ?? header('Retry-After'));
  if (Number.isFinite(wait) && wait > 0) holdRefresh(url, wait * 1000);
  if (response.status === 429) {
    if (previous) return previous;
    throw new Error('Refresh is cooling down');
  }
  let next: unknown;
  if (response.status === 304 || response.status === 204) {
    const checked = header('X-Dataset-Fetched-At');
    if (!previous || previous.mode !== 'api' || !etag || !checked || !Number.isFinite(Date.parse(checked))) throw new Error('Invalid unchanged response');
    next = { ...previous, fetchedAt: Date.parse(checked) > Date.parse(previous.fetchedAt) ? checked : previous.fetchedAt };
  } else {
    if (!response.ok) throw new Error('Refresh failed');
    next = await response.json();
  }
  if (!valid<T>(next, validate)) throw new Error('Invalid dataset');
  if (options.signal.aborted) throw new DOMException('Aborted', 'AbortError');
  if (next.mode === 'api' && (!previous || Date.parse(next.fetchedAt) >= Date.parse(previous.fetchedAt))) {
    const entry: Entry = { value: next, expiresAt: Math.min(Date.now() + options.maxAge, Date.parse(next.fetchedAt) + options.maxAge) };
    const version = header('ETag') || etag;
    // Only reuse the old validator when the server explicitly says unchanged.
    if (version && (header('ETag') || response.status === 304 || response.status === 204)) entry.etag = version;
    save(url, entry);
  }
  if (next.mode === 'api' && (options.force || previous && Date.parse(next.fetchedAt) > Date.parse(previous.fetchedAt))) invalidatePage(url);
  return next;
}

/** Hidden finders pause; expiry is checked on return without moving the deadline. */
export function pollDataset(url: string, refresh: () => Promise<void>, maxAge: number, initialRefresh = refresh): () => void {
  let active = true, running = false, retryAt = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const visibility = isMainDataset(url) && typeof document !== 'undefined' ? document : undefined;
  const hidden = () => visibility?.visibilityState === 'hidden';
  const run = async (check: () => Promise<void>) => {
    if (!active || running || hidden()) return;
    running = true; clearTimeout(timer);
    try { await check(); } finally {
      running = false;
      if (active && !hidden()) {
        const remaining = (read(url)?.expiresAt ?? 0) - Date.now();
        retryAt = remaining > 0 ? 0 : Date.now() + maxAge;
        timer = setTimeout(() => void run(refresh), remaining > 0 ? remaining + 1000 : maxAge);
      }
    }
  };
  const wake = () => {
    if (hidden()) { clearTimeout(timer); return; }
    if (!read(url) && Date.now() >= retryAt) void run(refresh);
    else if (!running) {
      clearTimeout(timer); timer = setTimeout(() => void run(refresh), Math.max(1000, (read(url)?.expiresAt ?? retryAt) - Date.now() + 1000));
    }
  };
  visibility?.addEventListener?.('visibilitychange', wake);
  if (visibility) window.addEventListener?.('focus', wake);
  void run(initialRefresh);
  return () => { active = false; clearTimeout(timer); visibility?.removeEventListener?.('visibilitychange', wake); if (visibility) window.removeEventListener?.('focus', wake); };
}
