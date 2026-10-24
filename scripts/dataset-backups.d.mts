export const kinds: string[];
export function validBackup(kind: string, data: unknown, previous?: unknown): boolean;
export function updateBackup(previous: Record<string, any>, incoming: Record<string, any>): Record<string, any>;

export function encodeBackup(data: unknown): unknown;
export function decodeBackup(value: unknown): Record<string, unknown>;
