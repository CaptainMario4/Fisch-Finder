/** Preserve Astro's routing index and scroll positions when updating filters. */
export function replaceFinderUrl(url: string): void {
  window.history.replaceState(window.history.state, '', url);
}

/** A departing island must not interpret another finder's query parameters. */
export function listenForFinderHistory(readUrl: () => void): () => void {
  const pathname = window.location.pathname;
  const onPopState = () => {
    if (window.location.pathname === pathname) readUrl();
  };
  window.addEventListener('popstate', onPopState);
  return () => window.removeEventListener('popstate', onPopState);
}
