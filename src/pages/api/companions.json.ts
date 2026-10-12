import type { APIRoute } from 'astro';
import { getCompanionDataset, refreshAvailableAt } from '../../lib/companions';
import { cooldownResponse, datasetResponse } from '../../lib/dataset-response';
export const prerender = false;
export const GET: APIRoute = async ({request}) => datasetResponse(request, await getCompanionDataset(), refreshAvailableAt());
export const POST: APIRoute = async ({request}) => {
  const availableAt = refreshAvailableAt();
  if (availableAt > Date.now()) return cooldownResponse(availableAt);
  return datasetResponse(request, await getCompanionDataset({ forceRefresh: true }), refreshAvailableAt());
};
