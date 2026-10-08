type PublicDataset = { fetchedAt: string; mode: string };
type Entry = { expiresAt: number; value: PublicDataset };
const memory = new Map<string, Entry>();
const keyFor = (url: string) => `fischfinder:dataset:v1:${url}`;

function valid<T extends PublicDataset>(value: unknown, validate: (value: T) => boolean): value is T {
  try {
    return !!value && typeof value === 'object' &&
      Number.isFinite(Date.parse((value as T).fetchedAt)) && validate(value as T);
  } catch { return false; }
}
function read(url: string): Entry | undefined {
  const key = keyFor(url);
  let entry = memory.get(key);
  if (!entry) {
    try { entry = JSON.parse(window.sessionStorage.getItem(key) || 'null'); } catch { /* Private browsing may deny storage. */ }
  }
  if (entry && Number.isFinite(entry.expiresAt) && entry.expiresAt > Date.now()) return entry;
  memory.delete(key);
  try { window.sessionStorage.removeItem(key); } catch { /* In-memory caching still works. */ }
}

/** Cache only validated, successful public datasets; never credentials or failed refreshes. */
export async function fetchDataset<T extends PublicDataset>(
  url: string,
  options: { force: boolean; signal: AbortSignal; maxAge: number },
  validate: (value: T) => boolean,
): Promise<T> {
  if (options.signal.aborted) throw new DOMException('Aborted', 'AbortError');
  const cached = read(url);
  if (!options.force && cached && valid<T>(cached.value, validate) && cached.value.mode === 'api') return cached.value;
  const response = await fetch(url, { method: options.force ? 'POST' : 'GET', cache: 'no-store', signal: options.signal });
  if (!response.ok) throw new Error('Refresh failed');
  const next: unknown = await response.json();
  if (!valid<T>(next, validate)) throw new Error('Invalid dataset');
  if (options.signal.aborted) throw new DOMException('Aborted', 'AbortError');
  if (next.mode === 'api' && (!cached || !valid<T>(cached.value, validate) || Date.parse(next.fetchedAt) >= Date.parse(cached.value.fetchedAt))) {
    // An old CDN response must not start a new full freshness window.
    const entry: Entry = { value: next, expiresAt: Math.min(Date.now() + options.maxAge, Date.parse(next.fetchedAt) + options.maxAge) };
    if (entry.expiresAt > Date.now()) {
      memory.set(keyFor(url), entry);
      try { window.sessionStorage.setItem(keyFor(url), JSON.stringify(entry)); } catch { /* Quota/storage errors never block rendering. */ }
    }
  }
  return next;
}

/** Recheck at the original data expiry, rather than delaying another interval on navigation. */
export function pollDataset(url: string, refresh: () => Promise<void>, maxAge: number, initialRefresh = refresh): () => void {
  let active = true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const run = async (check: () => Promise<void>) => {
    try { await check(); } finally {
      if (active) {
        const remaining = (read(url)?.expiresAt ?? 0) - Date.now();
        timer = setTimeout(() => void run(refresh), remaining > 0 ? remaining + 1000 : maxAge);
      }
    }
  };
  void run(initialRefresh);
  return () => { active = false; clearTimeout(timer); };
}
