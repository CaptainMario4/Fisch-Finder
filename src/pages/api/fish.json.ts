import type { APIRoute } from 'astro';
import { getDataset, refreshAvailableAt, fallback } from '../../lib/fisch';
import { withSecondary } from '../../lib/secondary-source';
import { cooldownResponse, datasetResponse } from '../../lib/dataset-response';
export const prerender = false;
export const GET: APIRoute = async ({request}) => datasetResponse(request, await withSecondary(await getDataset(), 'fish', fallback.fish), refreshAvailableAt());
export const POST: APIRoute = async ({request}) => {
  const availableAt = refreshAvailableAt();
  if (availableAt > Date.now()) return cooldownResponse(availableAt);
  return datasetResponse(request, await withSecondary(await getDataset({ forceRefresh: true }), 'fish', fallback.fish, true), refreshAvailableAt());
};
