export const DATASET_MAX_AGE = 6 * 60 * 60 * 1000;
export const MANUAL_REFRESH_COOLDOWN = 5 * 60 * 1000;
export const isMainDataset = (url: string) => /^\/api\/(fish|rods|companions|quests)\.json(?:\?|$)/.test(url);
