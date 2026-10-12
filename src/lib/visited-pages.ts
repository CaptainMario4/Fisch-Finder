import { DATASET_MAX_AGE } from './refresh-policy';
const paths = new Set(['/', '/rods', '/companions', '/quests']);
const maxAge = DATASET_MAX_AGE;
const snapshotAge = 60 * 1000;
type Entry<T> = { page: T; expiresAt: number };

/** Only the four public finders vary by client-side query parameters. */
export function finderPath(url: URL, origin: string): string | undefined {
  const path = url.pathname.replace(/\/$/, '') || '/';
  return url.origin === origin && paths.has(path) ? path : undefined;
}
export function pageExpiry(props: string | null, now = Date.now()): number {
  try {
    const initial = JSON.parse(props || '{}').initialData?.[1];
    const time = Date.parse(initial?.fetchedAt?.[1]);
    if (!Number.isFinite(time)) return 0;
    return initial?.mode?.[1] === 'api' ? Math.min(now + maxAge, time + maxAge) : now + snapshotAge;
  } catch { return 0; }
}
export function visitedPages<T>(copy: (value: T) => T) {
  const entries = new Map<string, Entry<T>>();
  return {
    put(path: string, page: T, expiresAt: number) {
      if (!paths.has(path) || expiresAt <= Date.now()) return;
      entries.set(path, { page: copy(page), expiresAt });
    },
    get(path: string): T | undefined {
      const entry = entries.get(path);
      if (!entry) return;
      if (entry.expiresAt <= Date.now()) { entries.delete(path); return; }
      return copy(entry.page);
    },
    delete(path: string) { entries.delete(path); },
  };
}

type Preparation = Event & {
  to: URL; signal: AbortSignal; formData?: FormData;
  newDocument: Document; loader: () => Promise<void>;
};
let installed = false;
export function installVisitedPages() {
  if (installed) return;
  installed = true;
  const cache = visitedPages<Document>(page => page.cloneNode(true) as Document);
  let started = 0, source = 'network', sequence = 0;
  const progress = (state: string) => {
    const bar = document.querySelector<HTMLElement>('[data-nav-progress]');
    if (bar) bar.dataset.state = state;
    if (state === 'loading') document.body.dataset.navigating = 'true';
    else delete document.body.dataset.navigating;
  };
  document.addEventListener('astro:before-preparation', raw => {
    const event = raw as Preparation;
    const navigation = ++sequence;
    started = performance.now(); source = 'network'; progress('loading');
    const path = finderPath(event.to, location.origin);
    if (!path || event.formData) return;
    const loader = event.loader;
    event.loader = async () => {
      if (event.signal.aborted) { if (navigation === sequence) progress('done'); return; }
      const page = cache.get(path);
      if (page && !event.signal.aborted) {
        // Clone the pristine server document, never a mounted React tree.
        event.newDocument = page; if (navigation === sequence) source = 'memory';
      } else {
        await loader();
        if (!event.signal.aborted && !event.defaultPrevented &&
            finderPath(event.to, location.origin) === path &&
            event.newDocument !== document &&
            event.newDocument.querySelector('[name="astro-view-transitions-enabled"]')) {
          const island = event.newDocument.querySelector('astro-island[props]');
          cache.put(path, event.newDocument, pageExpiry(island?.getAttribute('props') ?? null));
        }
      }
      if (navigation === sequence && (event.signal.aborted || event.defaultPrevented)) progress('done');
    };
  });
  document.addEventListener('astro:page-load', () => {
    progress('done');
    if (started) {
      // Local DOM diagnostics make timing verifiable without sending telemetry.
      document.documentElement.dataset.navMs = String(Math.round(performance.now() - started));
      document.documentElement.dataset.navSource = source;
      started = 0;
    }
  });
  document.addEventListener('fischfinder:dataset-refreshed', raw => {
    const url = (raw as CustomEvent<string>).detail;
    const path = ({ '/api/fish.json': '/', '/api/rods.json': '/rods', '/api/companions.json': '/companions', '/api/quests.json': '/quests' } as Record<string, string>)[url?.split('?')[0] ?? ''];
    if (path) cache.delete(path);
  });
}
