import type { APIRoute } from 'astro';
import { getRodDataset } from '../../lib/rods';
export const prerender = false;
export const GET: APIRoute = async ({ url }) => {
  const page = url.searchParams.get('rod');
  if (!page || page.length > 200) return new Response('Invalid rod', { status: 400 });
  const data = await getRodDataset();
  const key = page.replace(/_/g,' ').normalize('NFKD').toLowerCase();
  const rod = data.rods.find(rod => rod.page.replace(/_/g,' ').normalize('NFKD').toLowerCase() === key);
  if (!rod) return new Response('Rod not found', { status: 404 });
  return new Response(JSON.stringify({ rod, fetchedAt: data.fetchedAt, mode: data.mode }), {
    headers: { 'Content-Type':'application/json', 'Cache-Control':'public, max-age=60, s-maxage=1800' },
  });
};
