/** Weak validator: source-check time can advance without changing the facts. */
export async function datasetVersion(data: { fetchedAt: string }): Promise<string> {
  const { fetchedAt, ...content } = data;
  const bytes = new TextEncoder().encode(JSON.stringify(content));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const hex = Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('');
  return `W/"ff-${hex}"`;
}
