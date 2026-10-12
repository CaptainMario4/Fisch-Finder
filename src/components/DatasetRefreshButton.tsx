import { useEffect, useState } from 'react';
import { cooldownEvent, cooldownLabel, refreshAvailableAt } from '../lib/refresh-cooldown';
export default function DatasetRefreshButton({ endpoint, loading, onRefresh }: { endpoint: string; loading: boolean; onRefresh: () => void }) {
  const [remaining, setRemaining] = useState(0);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const update = () => {
      clearTimeout(timer);
      const seconds = Math.max(0, Math.ceil((refreshAvailableAt(endpoint) - Date.now()) / 1000));
      setRemaining(seconds);
      if (seconds) timer = setTimeout(update, 1000);
    };
    update();
    window.addEventListener(cooldownEvent, update);
    window.addEventListener('storage', update);
    window.addEventListener('focus', update);
    return () => { clearTimeout(timer); window.removeEventListener(cooldownEvent, update); window.removeEventListener('storage', update); window.removeEventListener('focus', update); };
  }, [endpoint]);
  return <button className="fish-refresh" disabled={loading || remaining > 0} onClick={onRefresh} title={remaining ? 'Manual refresh has a five-minute cooldown. Automatic checks use a six-hour cache.' : 'Check for updated wiki data'}>
    {loading ? 'Refreshing…' : remaining ? cooldownLabel(remaining) : 'Refresh data'} <span aria-hidden="true">↻</span>
  </button>;
}
