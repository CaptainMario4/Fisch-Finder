import type { APIRoute } from 'astro';
import { getQuestDataset } from '../../lib/quests';
export const prerender = false;
export const GET: APIRoute = async () => new Response(JSON.stringify(await getQuestDataset()), {
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=60, s-maxage=1800' },
});
export const POST: APIRoute = async () => new Response(JSON.stringify(await getQuestDataset({ forceRefresh: true })), {
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});
