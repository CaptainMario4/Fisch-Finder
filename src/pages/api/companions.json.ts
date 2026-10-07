import type { APIRoute } from 'astro';
import { getCompanionDataset } from '../../lib/companions';
export const prerender = false;
export const GET: APIRoute = async () => new Response(JSON.stringify(await getCompanionDataset()), {
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=60, s-maxage=1800' },
});
export const POST: APIRoute = async () => new Response(JSON.stringify(await getCompanionDataset({ forceRefresh: true })), {
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});
