import { recoverDataset } from '../../lib/persistent-backup';
import type { APIRoute } from 'astro';
import { getCompanionDataset, refreshAvailableAt } from '../../lib/companions';
import { cooldownResponse, datasetResponse } from '../../lib/dataset-response';
export const prerender = false;
export const GET: APIRoute = async ({request}) => datasetResponse(request, await recoverDataset('companions', await getCompanionDataset()), refreshAvailableAt());
export const POST: APIRoute = async ({request}) => {
  const availableAt = refreshAvailableAt();
  if (availableAt > Date.now()) return cooldownResponse(availableAt);
  return datasetResponse(request, await recoverDataset('companions', await getCompanionDataset({ forceRefresh: true })), refreshAvailableAt());
};
