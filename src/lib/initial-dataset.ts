/** Use current server data without allowing a slow wiki to block page rendering.
 * Existing loaders coalesce requests and retain the last good data on failure.
 * A timeout returns the saved dataset; the normal client refresh then recovers.
 */
export async function initialDataset<T>(load: () => Promise<T>, fallback: T, maxWait = 2000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve().then(load).catch(() => fallback),
      new Promise<T>(resolve => { timer = setTimeout(() => resolve(fallback), maxWait); }),
    ]);
  } finally { clearTimeout(timer); }
}
