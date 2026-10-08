import type { APIRoute } from 'astro';
import { getDataset, fallback } from '../../lib/fisch';
import { withSecondary } from '../../lib/secondary-source';
export const prerender = false;
export const GET: APIRoute = async () => new Response(JSON.stringify(await withSecondary(await getDataset(), 'fish', fallback.fish)), {
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=60, s-maxage=1800' },
});
// Manual refresh is a POST so an edge or browser cache cannot serve an old GET.
export const POST: APIRoute = async () => new Response(JSON.stringify(await withSecondary(await getDataset({ forceRefresh: true }), 'fish', fallback.fish)), {
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});
