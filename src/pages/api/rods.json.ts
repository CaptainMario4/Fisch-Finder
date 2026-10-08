import type { APIRoute } from 'astro';
import { getRodDataset, rodFallback } from '../../lib/rods';
import { withSecondary } from '../../lib/secondary-source';
export const prerender = false;
export const GET: APIRoute = async () => new Response(JSON.stringify(await withSecondary(await getRodDataset(), 'rods', rodFallback.rods)), {
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=60, s-maxage=1800' },
});
export const POST: APIRoute = async () => new Response(JSON.stringify(await withSecondary(await getRodDataset({ forceRefresh: true }), 'rods', rodFallback.rods)), {
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});
