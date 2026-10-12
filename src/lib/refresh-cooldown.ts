import { isMainDataset, MANUAL_REFRESH_COOLDOWN } from './refresh-policy';
const memory = new Map<string, number>();
const keyFor = (url: string) => `fischfinder:refresh:v1:${url.split('?')[0]}`;
export const cooldownEvent = 'fischfinder:refresh-cooldown';
export function refreshAvailableAt(url: string): number {
  if (!isMainDataset(url)) return 0;
  const key = keyFor(url);
  let stored = 0;
  try { stored = Number(window.localStorage.getItem(key)); } catch { /* Private browsing uses memory. */ }
  const now = Date.now();
  return Math.max(0, ...[stored, memory.get(key) ?? 0].filter(value => Number.isFinite(value) && value > now && value <= now + MANUAL_REFRESH_COOLDOWN + 30000));
}
export function holdRefresh(url: string, milliseconds = MANUAL_REFRESH_COOLDOWN): void {
  if (!isMainDataset(url)) return;
  const until = Math.max(refreshAvailableAt(url), Date.now() + Math.min(MANUAL_REFRESH_COOLDOWN, Math.max(0, milliseconds)));
  memory.set(keyFor(url), until);
  try { window.localStorage.setItem(keyFor(url), String(until)); } catch { /* Storage failures never block data. */ }
  if (typeof CustomEvent !== 'undefined') window.dispatchEvent?.(new CustomEvent(cooldownEvent));
}
export function cooldownLabel(seconds: number): string {
  return `Refresh available in ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
