import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { Dataset, Fish } from '../lib/fisch';
import type { ScheduleData } from '../lib/schedules';
import ScheduleCards from './ScheduleCards';
import '../styles/fish-database.css';

type Filters = { region: string; location: string; bait: string; time: string; weather: string; season: string; rarity: string; status: string };
const defaults: Filters = { region: '', location: '', bait: '', time: '', weather: '', season: '', rarity: '', status: '' };
const keys = Object.keys(defaults) as (keyof Filters)[];
const normalize = (value: string) => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const preference = (values: string[]) => values.length ? values.join(', ') : 'No listed preference';
const listed = (value: string) => value || 'Not listed';
const path = (value: string) => value.split('/').join(' / ');
const statuses = (fish: Fish) => [fish.removed ? 'Removed' : '', fish.unobtainable ? 'Unobtainable' : ''].filter(Boolean);
const unavailable = (fish: Fish) => fish.removed || fish.unobtainable;
const pageSize = 25;
function timestamp(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not recorded' : date.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, ' UTC');
}
function SearchIcon() { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="10.8" cy="10.8" r="7.3"/><path d="m16.2 16.2 4.3 4.3"/></svg>; }
function Field({ label, children }: { label: string; children: ReactNode }) { return <div className="fish-detail-field"><dt>{label}</dt><dd>{children}</dd></div>; }
function Detail({ fish, close }: { fish: Fish | undefined; close: () => void }) {
  if (!fish) return <aside className="fish-detail" id="fish-detail" aria-label="Fish details"><div className="fish-detail-empty"><div className="fish-detail-symbol"><SearchIcon /></div><h2>Select a fish</h2><p>Click anywhere in an entry’s row to see its catch preferences and source information here.</p><span>Search a name or region, or narrow the list with filters.</span></div></aside>;
  return <aside className="fish-detail" id="fish-detail" aria-label={`Details for ${fish.name}`}>
    <div className="fish-detail-heading"><div><p className="text-mute text-xs font-medium uppercase tracking-wide">{fish.nonfish ? 'Non-fish entry' : 'Fish entry'}</p><h2>{fish.name}</h2><p className="fish-detail-region">{listed(fish.region)}</p></div><button className="fish-close" onClick={close} aria-label="Close fish details">×</button></div>
    <div className="fish-detail-status"><span className="fish-tag">{listed(fish.rarity)}</span><span className={`fish-tag ${unavailable(fish) ? 'fish-tag-warning' : ''}`}>{unavailable(fish) ? 'Unavailable' : 'Available'}</span></div>
    <div className="fish-detail-body"><h3>Catch preferences</h3><dl className="fish-detail-list">
      <Field label="Location">{path(listed(fish.location))}</Field><Field label="Bestiary / region">{listed(fish.region)}</Field><Field label="Preferred bait">{preference(fish.bait)}</Field><Field label="Time of day">{preference(fish.time)}</Field><Field label="Weather">{preference(fish.weather)}</Field><Field label="Season">{preference(fish.season)}</Field>
    </dl><h3 className="mt-lg">Source details</h3><dl className="fish-detail-list">
      {unavailable(fish) && <Field label="Wiki status">{statuses(fish).join(', ')}</Field>}<Field label="Obtainment methods">{fish.methods.length ? fish.methods.join(', ') : 'Not listed'}</Field><Field label="Event">{listed(fish.event)}</Field><Field label="Radar / GPS">{fish.radar.length ? fish.radar.map((value, i) => <span className="block" key={i}>{value}</span>) : 'Not listed'}</Field>
    </dl>{[ { title: 'Listed availability locations', values: fish.locations }, { title: 'Crab cage locations', values: fish.crabCages }, { title: 'Listed admin events', values: fish.adminEvents } ].filter(item => item.values.length).map(item => <details className="fish-source-list" key={item.title}><summary>{item.title} ({item.values.length})</summary><ul>{item.values.map((value, i) => <li key={i}>{path(value)}</li>)}</ul></details>)}
    <div className="fish-requirements"><strong>Special requirements</strong><p>Preferences alone do not describe every requirement. Check the wiki for spawn rules, quests, and other conditions.</p><a href={`${fish.url}#Obtainment`} target="_blank" rel="noopener noreferrer">Read obtainment requirements ↗</a></div></div>
    <div className="fish-detail-footer"><a href={fish.url} target="_blank" rel="noopener noreferrer">Open full Fischipedia page ↗</a></div>
  </aside>;
}

export default function FishDatabase({ initialData, initialSchedules }: { initialData: Dataset; initialSchedules: ScheduleData }) {
  const [refreshSequence, setRefreshSequence] = useState(0);
  const [data, setData] = useState(initialData), [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [query, setQuery] = useState(''), [filters, setFilters] = useState<Filters>({ ...defaults }), [selectedPage, setSelectedPage] = useState('');
  const [page, setPage] = useState(1), [sort, setSort] = useState('name-asc'), [urlReady, setUrlReady] = useState(false);
  async function refresh(forceRefresh = false) {
    if (forceRefresh) setRefreshSequence(current => current + 1);
    setLoading(true); setError('');
    try {
      const response = await fetch('/api/fish.json', { method: forceRefresh ? 'POST' : 'GET', cache: 'no-store', signal: AbortSignal.timeout(22000) });
      if (!response.ok) throw new Error('Fetch failed');
      const next = await response.json() as Dataset;
      if (!Array.isArray(next.fish) || !next.fish.length || !next.fetchedAt) throw new Error('Invalid dataset');
      setData(current => {
        // A different server instance may only have the bundled snapshot on
        // failure. Keep the newer data already visible in this browser.
        if (Date.parse(next.fetchedAt) < Date.parse(current.fetchedAt)) {
          return next.mode === 'snapshot'
            ? { ...current, mode: 'snapshot', notice: next.notice }
            : current;
        }
        return next;
      });
    } catch { setError('Refresh unavailable. The saved data below remains searchable; its source timestamp is unchanged.'); }
    finally { setLoading(false); }
  }
  useEffect(() => {
    const readUrl = () => {
      const params = new URLSearchParams(window.location.search), restored = { ...defaults };
      setQuery(params.get('q') || ''); setSelectedPage(params.get('fish') || '');
      setSort(['name-asc', 'name-desc', 'region-asc', 'rarity-asc'].includes(params.get('sort') || '') ? params.get('sort')! : 'name-asc');
      setPage(Math.max(1, Number(params.get('page')) || 1));
      keys.forEach(key => { restored[key] = params.get(key) ?? defaults[key]; });
      // Keep previously shared status links working after simplifying the filter.
      const status = restored.status;
      restored.status = status === 'available' || status === 'unmarked' ? 'available' : ['unavailable', 'removed', 'unobtainable'].includes(status) ? 'unavailable' : '';
      setFilters(restored); setUrlReady(true);
    };
    readUrl(); void refresh(); const interval = window.setInterval(() => void refresh(), 30 * 60 * 1000);
    window.addEventListener('popstate', readUrl);
    return () => { window.removeEventListener('popstate', readUrl); window.clearInterval(interval); };
  }, []);
  useEffect(() => {
    if (!urlReady) return; const params = new URLSearchParams();
    if (query) params.set('q', query); keys.forEach(key => { if (filters[key] !== defaults[key]) params.set(key, filters[key]); });
    if (selectedPage) params.set('fish', selectedPage); if (sort !== 'name-asc') params.set('sort', sort); if (page > 1) params.set('page', String(page));
    window.history.replaceState(null, '', `${window.location.pathname}${params.size ? '?' + params.toString() : ''}`);
  }, [query, filters, selectedPage, sort, page, urlReady]);
  const options = useMemo(() => {
    const values = (key: 'region' | 'location' | 'rarity') => [...new Set(data.fish.map(f => f[key]).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    const arrays = (key: 'bait' | 'time' | 'weather' | 'season') => [...new Set(data.fish.flatMap(f => f[key]))].sort((a, b) => a.localeCompare(b));
    return { region: values('region'), location: values('location'), rarity: values('rarity'), bait: arrays('bait'), time: arrays('time'), weather: arrays('weather'), season: arrays('season') };
  }, [data.fish]);
  const results = useMemo(() => data.fish.filter(fish => {
    const needle = normalize(query);
    if (needle && ![fish.name, fish.page, fish.region, fish.location].some(value => normalize(value).includes(needle))) return false;
    if (filters.region && fish.region !== filters.region || filters.location && fish.location !== filters.location || filters.rarity && fish.rarity !== filters.rarity) return false;
    for (const key of ['bait', 'time', 'weather', 'season'] as const) if (filters[key] === '__none__' ? fish[key].length > 0 : filters[key] && !fish[key].includes(filters[key])) return false;
    if (filters.status === 'available' && unavailable(fish) || filters.status === 'unavailable' && !unavailable(fish)) return false;
    return true;
  }).sort((a, b) => sort === 'name-desc' ? b.name.localeCompare(a.name) : sort === 'region-asc' ? a.region.localeCompare(b.region) || a.name.localeCompare(b.name) : sort === 'rarity-asc' ? a.rarity.localeCompare(b.rarity) || a.name.localeCompare(b.name) : a.name.localeCompare(b.name)), [data.fish, query, filters, sort]);
  const pageCount = Math.max(1, Math.ceil(results.length / pageSize)), currentPage = Math.min(page, pageCount);
  const visible = results.slice((currentPage - 1) * pageSize, currentPage * pageSize), selected = data.fish.find(f => f.page === selectedPage);
  const activeFilters = keys.filter(key => filters[key] !== defaults[key]).length;
  function updateFilter(key: keyof Filters, value: string) { setFilters(current => ({ ...current, [key]: value })); setPage(1); }
  function clearFilters() { setFilters({ ...defaults }); setQuery(''); setPage(1); }
  function choose(fish: Fish) { setSelectedPage(fish.page); if (window.innerWidth < 1100) window.setTimeout(() => document.getElementById('fish-detail')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0); }
  const filterSelect = (key: keyof typeof options, label: string) => <label className="fish-filter" key={key}><span>{label}</span><select value={filters[key]} onChange={event => updateFilter(key, event.target.value)}><option value="">All {label.toLowerCase()}</option>{['bait', 'time', 'weather', 'season'].includes(key) && <option value="__none__">No listed preference</option>}{filters[key] && filters[key] !== '__none__' && !options[key].includes(filters[key]) && <option value={filters[key]}>{filters[key]}</option>}{options[key].map(value => <option value={value} key={value}>{key === 'location' ? path(value) : value}</option>)}</select></label>;
  return <section className="fish-database" aria-label="Searchable Fisch database">
    <header className="flex flex-wrap items-start justify-between gap-lg mb-lg"><div><p className="text-accent text-xs font-semibold uppercase tracking-wide mb-xs">Fischipedia data, easier to read</p><h1 className="text-3xl font-semibold tracking-tight">Fisch Database</h1><p className="text-mute mt-xs">Find a fish. See its listed catch preferences in one place.</p></div><div className="fish-source-summary"><span className={`fish-data-badge ${data.mode === 'snapshot' || error ? 'fish-data-badge-snapshot' : ''}`}>{loading ? 'Checking wiki data…' : error || data.mode === 'snapshot' ? 'Saved wiki snapshot' : 'Wiki API data'}</span><p>Source checked: {timestamp(data.fetchedAt)}</p><button className="fish-refresh" onClick={() => void refresh(true)} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh data'} <span aria-hidden="true">↻</span></button></div></header>
    {(error || (!loading && data.notice)) && <p className="fish-data-notice" role="status">{error || data.notice}</p>}
    <ScheduleCards initialData={initialSchedules} refreshSequence={refreshSequence} onSeason={season => {
      setQuery(''); setFilters({ ...defaults, season }); setPage(1);
      window.setTimeout(() => document.getElementById('fish-search-controls')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
    }} />
    <div className="fish-controls" id="fish-search-controls"><label className="fish-search"><SearchIcon /><span className="sr-only">Search fish by name or region</span><input type="search" placeholder="Search fish or region — try Megalodon or Moosewood" value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} autoComplete="off" />{query && <button onClick={() => { setQuery(''); setPage(1); }} aria-label="Clear search">×</button>}</label>
    <div className="flex items-center justify-between gap-md mt-lg mb-sm"><h2 className="text-sm font-semibold">Filter catch preferences</h2><button className="fish-clear" onClick={clearFilters} disabled={!activeFilters && !query}>Clear search & filters{activeFilters > 0 ? ` (${activeFilters})` : ''}</button></div>
    <div className="fish-filters">{filterSelect('region', 'Bestiary / region')}{filterSelect('location', 'Location')}{filterSelect('bait', 'Preferred bait')}{filterSelect('time', 'Time of day')}{filterSelect('weather', 'Weather')}{filterSelect('season', 'Season')}{filterSelect('rarity', 'Rarity')}<label className="fish-filter"><span>Availability status</span><select value={filters.status} onChange={event => updateFilter('status', event.target.value)}><option value="">All</option><option value="available">Available</option><option value="unavailable">Unavailable</option></select></label></div>
    <details className="fish-data-legend"><summary>How to read this data</summary><p><strong>Preferences are not guarantees.</strong> “No listed preference” means the wiki's preference field is empty (displayed as “None” on the wiki); it does not mean there are no special requirements. “Not listed” means the source field is empty. “Unavailable” means the wiki marks the entry as removed or unobtainable. “Available” means neither flag is set; it does not confirm that every event or catch requirement is active in your server.</p><p>Bestiary / region and location are separate wiki fields. Slash-separated locations show the source's location path. API data is checked on opening this page and every 30 minutes while it stays open, with a server cache of up to 30 minutes. The Refresh data button checks the wiki again immediately; the source time changes only after a successful check. This is wiki data, not live game or server state.</p></details></div>
    <div className="fish-workspace"><div className="fish-results"><div className="fish-results-heading"><p role="status" aria-live="polite"><strong>{results.length.toLocaleString('en-US')}</strong> {results.length === 1 ? 'entry' : 'entries'}<span> of {data.fish.length.toLocaleString('en-US')} total catches</span></p><label className="fish-sort"><span>Sort</span><select value={sort} onChange={event => { setSort(event.target.value); setPage(1); }}><option value="name-asc">Name A–Z</option><option value="name-desc">Name Z–A</option><option value="region-asc">Bestiary A–Z</option><option value="rarity-asc">Rarity A–Z</option></select></label></div>
    {results.length ? <><div className="fish-table-scroll" tabIndex={0} role="region" aria-label="Fish results table; scroll for more columns"><table className="fish-table"><caption className="sr-only">Click anywhere in a row for full details. Keyboard users can activate the fish name button.</caption><thead><tr>{['Fish', 'Location', 'Preferred bait', 'Time', 'Weather', 'Season', 'Rarity'].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead><tbody>{visible.map(fish => <tr key={fish.id} onClick={() => choose(fish)} className={selectedPage === fish.page ? 'fish-row-selected' : ''}><td><button className="fish-name" aria-pressed={selectedPage === fish.page} aria-controls="fish-detail">{fish.name}</button>{fish.nonfish && <span className="fish-row-note">Non-fish</span>}{unavailable(fish) && <span className="fish-row-status">Unavailable</span>}</td><td>{path(listed(fish.location))}{fish.region && fish.region !== fish.location && <span className="fish-row-note">{fish.region}</span>}</td>{(['bait', 'time', 'weather', 'season'] as const).map(key => <td className={!fish[key].length ? 'fish-missing' : ''} key={key}>{preference(fish[key])}</td>)}<td>{listed(fish.rarity)}</td></tr>)}</tbody></table></div><div className="fish-pagination"><p>{(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, results.length)} of {results.length.toLocaleString('en-US')}</p><div className="flex items-center gap-sm"><button onClick={() => setPage(currentPage - 1)} disabled={currentPage === 1} aria-label="Previous page">←</button><span>Page {currentPage} of {pageCount}</span><button onClick={() => setPage(currentPage + 1)} disabled={currentPage === pageCount} aria-label="Next page">→</button></div></div></> : <div className="fish-results-empty"><SearchIcon /><h3>No entries match</h3><p>Try part of a fish name or region, or remove a filter. Filters use the wiki's exact listed preferences.</p><button className="btn-primary" onClick={clearFilters}>Clear search & filters</button></div>}
    <p className="fish-results-note">Click anywhere in an entry’s row for details. Listed preferences may differ from required spawn or catch conditions.</p></div><div><Detail fish={selected} close={() => setSelectedPage('')} />{selectedPage && !selected && <p className="fish-data-notice">The linked entry was not found in this dataset.</p>}</div></div>
    <noscript><p>Enable JavaScript to search, filter, and open fish details.</p></noscript>
  </section>;
}
