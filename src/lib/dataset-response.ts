import { datasetVersion } from './dataset-version';
import { DATASET_MAX_AGE } from './refresh-policy';
export function cooldownResponse(availableAt: number): Response {
  const wait = Math.max(1, Math.ceil((availableAt - Date.now()) / 1000));
  return new Response(JSON.stringify({ error: 'Refresh cooldown', retryAfter: wait }), {
    status: 429, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Retry-After': String(wait), 'X-Refresh-Wait': String(wait) },
  });
}
export async function datasetResponse(request: Request, data: { fetchedAt: string; mode: string }, availableAt: number): Promise<Response> {
  const etag = await datasetVersion(data);
  const headers = new Headers({
    'Content-Type': 'application/json', 'ETag': etag,
    // Revalidate at the origin so manual refreshes can immediately replace edge data.
    'Cache-Control': 'no-cache, max-age=0, must-revalidate',
    'X-Dataset-Fetched-At': data.fetchedAt, 'X-Dataset-Max-Age': String(DATASET_MAX_AGE / 1000),
    'X-Refresh-Wait': String(Math.max(0, Math.ceil((availableAt - Date.now()) / 1000))),
  });
  if (request.method === 'POST' || data.mode !== 'api') headers.set('Cache-Control', 'no-store');
  // Wix hosting can normalize conditional headers/statuses. A public version
  // query supplies the same validator without relying on the edge's behavior.
  const explicit = new URL(request.url).searchParams.get('version') === etag;
  const matches = explicit || request.headers.get('If-None-Match')?.split(',').some(tag => tag.trim() === etag);
  if (matches && data.mode === 'api') {
    if (explicit) return new Response(JSON.stringify({ unchanged: true }), { headers });
    return new Response(null, { status: request.method === 'POST' ? 204 : 304, headers });
  }
  return new Response(JSON.stringify(data), { headers });
}
