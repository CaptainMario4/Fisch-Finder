import type { APIRoute } from 'astro';
import { getSchedules } from '../../lib/schedules';
export const prerender = false;
const respond = async (force: boolean) => new Response(JSON.stringify(await getSchedules(force)), {
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});
export const GET: APIRoute = () => respond(false);
export const POST: APIRoute = () => respond(true);
