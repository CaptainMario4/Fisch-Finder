import type { APIRoute } from 'astro';
import { getDataset } from '../../lib/fisch';
export const prerender = false;
export const GET: APIRoute = async () => new Response(JSON.stringify(await getDataset()), {
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=60, s-maxage=1800' },
});
// Manual refresh is a POST so an edge or browser cache cannot serve an old GET.
export const POST: APIRoute = async () => new Response(JSON.stringify(await getDataset({ forceRefresh: true })), {
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});
