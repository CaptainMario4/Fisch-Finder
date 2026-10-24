import bundled from '../data/last-good-datasets.json';
import { validBackup, decodeBackup } from '../../scripts/dataset-backups.mjs';
type Dataset = { mode: string; fetchedAt: string; notice: string };
const local = decodeBackup(bundled);
const url = 'https://raw.githubusercontent.com/CaptainMario4/Fisch-Finder/main/src/data/last-good-datasets.json';
let remote: Record<string, unknown> = {}, expires = 0, pending: Promise<void> | undefined;
export function savedDataset<T extends Dataset>(kind: string, data: T): T {
  if (data.mode === 'api') return data;
  let best = data;
  for (const source of [local, remote]) {
    const candidate = (source as Record<string, unknown>)[kind];
    if (validBackup(kind, candidate) && Date.parse((candidate as T).fetchedAt) > Date.parse(best.fetchedAt)) best = candidate as T;
  }
  return best === data ? data : { ...best, mode: 'snapshot', notice: 'Wiki refresh unavailable. Showing the last validated persistent backup with its original source timestamp.' };
}
export async function recoverDataset<T extends Dataset>(kind: string, data: T): Promise<T> {
  if (data.mode === 'api') return data;
  if (!pending && Date.now() >= expires) {
    pending = (async () => {
      expires = Date.now() + 6 * 60 * 60 * 1000;
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
        if (!response.ok || Number(response.headers.get('content-length') || 0) > 10000000) throw Error('Backup unavailable');
        const body = await response.text(); if (body.length > 10000000) throw Error('Backup too large');
        const next: unknown = decodeBackup(JSON.parse(body));
        if (!next || typeof next !== 'object') throw Error('Invalid backup');
        // Validate each dataset independently; a corrupt entry cannot replace a good copy.
        for (const key of ['fish','rods','companions','quests']) {
          const value = (next as Record<string,unknown>)[key];
          const old = remote[key] as Dataset | undefined;
          if (validBackup(key,value) && (!old || Date.parse((value as Dataset).fetchedAt) > Date.parse(old.fetchedAt))) remote[key] = value;
        }
      } catch { /* Bundled and last successful remote backups remain available. */ }
      finally { pending = undefined; }
    })();
  }
  await pending;
  return savedDataset(kind,data);
}
