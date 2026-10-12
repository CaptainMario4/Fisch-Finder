import type { APIRoute } from 'astro';
import { getRodDataset, refreshAvailableAt, rodFallback } from '../../lib/rods';
import { withSecondary } from '../../lib/secondary-source';
import { cooldownResponse, datasetResponse } from '../../lib/dataset-response';
export const prerender = false;
export const GET: APIRoute = async ({request}) => datasetResponse(request, await withSecondary(await getRodDataset(), 'rods', rodFallback.rods), refreshAvailableAt());
export const POST: APIRoute = async ({request}) => {
  const availableAt = refreshAvailableAt();
  if (availableAt > Date.now()) return cooldownResponse(availableAt);
  return datasetResponse(request, await withSecondary(await getRodDataset({ forceRefresh: true }), 'rods', rodFallback.rods, true), refreshAvailableAt());
};
