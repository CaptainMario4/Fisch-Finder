import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { Companion, CompanionDataset } from '../lib/companions';
import '../styles/fish-database.css';
import '../styles/companion-database.css';
import { companionFilterDefaults as defaults, companionFilterLabels as labels, companionFilterOptions, companionAbilityTypes, companionSorts, findCompanions } from '../lib/companion-search';
import type { CompanionFilters as Filters } from '../lib/companion-search';

const keys = Object.keys(defaults) as (keyof Filters)[];
const listed = (value: string) => value || 'Not listed';
const pageSize = 25;
function timestamp(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? 'Not recorded' : date.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, ' UTC'); }
function SearchIcon() { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="10.8" cy="10.8" r="7.3"/><path d="m16.2 16.2 4.3 4.3"/></svg>; }
function Field({ label, children }: { label: string; children: ReactNode }) { return <div className="fish-detail-field"><dt>{label}</dt><dd>{children}</dd></div>; }
function AbilitySummary({ companion }: { companion: Companion }) {
  if (!companion.abilities.length) return <>No ability listed</>;
  const text = companion.abilities.flatMap(ability => [ability.text, ...ability.details]).join(' ');
  return <><span className="companion-ability-types">{companionAbilityTypes(companion).join(' · ')}</span><span className="fish-row-note">{text.length > 150 ? text.slice(0, 150).replace(/\s+\S*$/, '') + '…' : text}</span></>;
}
function Detail({ companion, close }: { companion: Companion | undefined; close: () => void }) {
  if (!companion) return <aside className="fish-detail" id="companion-detail" aria-label="Companion details"><div className="fish-detail-empty"><div className="fish-detail-symbol"><SearchIcon /></div><h2>Select a companion</h2><p>Choose a row to read its abilities, level bonuses, and obtainment requirements.</p><span>Search by companion, food, location, or bonus.</span></div></aside>;
  return <aside className="fish-detail" id="companion-detail" aria-label={`Details for ${companion.name}`}>
    <div className="fish-detail-heading"><div><p className="text-mute text-xs font-medium uppercase tracking-wide">Companion</p><h2 id="companion-detail-title">{companion.name}</h2><p className="fish-detail-region">{listed(companion.region)}</p></div><button className="fish-close" onClick={close} aria-label="Close companion details">×</button></div>
    <div className="fish-detail-status"><span className={`fish-tag ${companion.unavailable ? 'fish-tag-warning' : ''}`}>{companion.unavailable ? 'Unavailable' : 'Available'}</span>{companion.source && <span className="fish-tag">{companion.source}</span>}{companion.event && <span className="fish-tag">{companion.event}</span>}</div>
    <div className="fish-detail-body">
      {companion.description && <p className="companion-description">{companion.description}</p>}
      <h3>Abilities & level bonuses</h3><p className="companion-note">Listed percentages and max-level bonuses come from Fischipedia. Companions reach level 10; their satchel unlocks at player level 30.</p>
      {companion.abilities.length ? <div className="companion-abilities">{companion.abilities.map((ability, index) => <section key={index}><h4>{ability.group}</h4><p>{ability.text}</p>{ability.details.length > 0 && <ul>{ability.details.map((text, i) => <li key={i}>{text}</li>)}</ul>}{ability.notes.map((note, i) => <p className="companion-note" key={i}>{note}</p>)}</section>)}</div> : <p className="companion-note">No ability listed in the source.</p>}
      {companion.notes && <p className="companion-note companion-global-note">{companion.notes}</p>}
      {companion.buffs.length > 0 && <section className="companion-buffs"><h3>Relic-fed buffs</h3><p className="companion-note">One primary and one secondary buff can be active at the same time.</p><ul>{companion.buffs.map(buff => <li key={buff.food}><h4>{buff.food}</h4><p className="companion-note">Companion level {buff.level} · {buff.type} · {buff.category}</p><p>{buff.effect}</p></li>)}</ul></section>}
      <h3 className="mt-lg">Obtainment</h3><dl className="fish-detail-list"><Field label="Location">{listed(companion.region)}</Field><Field label="Method">{listed(companion.source)}</Field><Field label="Food / bait">{listed(companion.food)}</Field><Field label="Event">{companion.event || 'No event listed'}</Field></dl>
      {companion.obtainment.length > 0 && <div className="companion-obtainment">{companion.obtainment.map((text, i) => <p key={i}>{text}</p>)}</div>}
      {companion.gameplayNotes.length > 0 && <div className="companion-gameplay"><h3>Gameplay notes</h3><ul>{companion.gameplayNotes.map((text, i) => <li key={i}>{text}</li>)}</ul></div>}
      <div className="fish-requirements"><strong>Check the full requirements</strong><p>Availability reflects the wiki’s unobtainable flag. An obtainable companion may still require a specific event, weather, quest, or feeding condition.</p><a href={`${companion.url}#Obtainment`} target="_blank" rel="noopener noreferrer">Read obtainment requirements ↗</a></div>
    </div><div className="fish-detail-footer"><a href={companion.url} target="_blank" rel="noopener noreferrer">Open full Fischipedia page ↗</a></div>
  </aside>;
}

export default function CompanionDatabase({ initialData }: { initialData: CompanionDataset }) {
  const [data, setData] = useState(initialData), [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [query, setQuery] = useState(''), [filters, setFilters] = useState<Filters>({ ...defaults });
  const [selectedPage, setSelectedPage] = useState(''), [page, setPage] = useState(1), [sort, setSort] = useState('name-asc'), [urlReady, setUrlReady] = useState(false);
  const [mobile, setMobile] = useState(false), [filtersOpen, setFiltersOpen] = useState(false);
  const detailDialog = useRef<HTMLDialogElement>(null), detailTrigger = useRef<HTMLElement | null>(null), filterToggle = useRef<HTMLButtonElement>(null);
  const refreshController = useRef<AbortController | null>(null);
  useEffect(() => { const media = window.matchMedia('(max-width: 767px)'); const sync = () => setMobile(media.matches); sync(); media.addEventListener('change', sync); return () => media.removeEventListener('change', sync); }, []);
  async function refresh(force = false) {
    refreshController.current?.abort(); const controller = new AbortController(); refreshController.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 45000);
    setLoading(true); setError('');
    try {
      // Keep an older edge-cached parsing format from replacing this snapshot
      // after a release. Bump this key when the normalized data format changes.
      const response = await fetch('/api/companions.json?schema=1', { method: force ? 'POST' : 'GET', cache: 'no-store', signal: controller.signal });
      if (!response.ok) throw new Error('Refresh failed'); const next = await response.json() as CompanionDataset;
      if (!Array.isArray(next.companions) || !next.companions.length || next.companions.some(item => !item || typeof item.name !== 'string' || !Array.isArray(item.abilities) || !Array.isArray(item.buffs) || !Array.isArray(item.obtainment) || !Array.isArray(item.gameplayNotes)) || !Number.isFinite(Date.parse(next.fetchedAt))) throw new Error('Invalid companion data');
      setData(current => Date.parse(next.fetchedAt) < Date.parse(current.fetchedAt) ? { ...current, mode: next.mode, notice: next.notice } : next);
    } catch { if (refreshController.current === controller) setError('Refresh unavailable. The saved companions and abilities remain searchable with their original source timestamp.'); }
    finally { window.clearTimeout(timeout); if (refreshController.current === controller) setLoading(false); }
  }
  useEffect(() => {
    const readUrl = () => {
      const params = new URLSearchParams(window.location.search), restored = { ...defaults };
      setQuery(params.get('q') || ''); setSelectedPage(params.get('companion') || '');
      setSort(companionSorts.some(value => value === params.get('sort')) ? params.get('sort')! : 'name-asc');
      const requestedPage = Number(params.get('page')); setPage(Number.isFinite(requestedPage) ? Math.max(1, Math.floor(requestedPage)) : 1);
      keys.forEach(key => restored[key] = params.get(key) ?? ''); setFilters(restored); setUrlReady(true);
    };
    readUrl(); void refresh(); const interval = window.setInterval(() => void refresh(), 30 * 60 * 1000);
    window.addEventListener('popstate', readUrl);
    return () => { window.removeEventListener('popstate', readUrl); window.clearInterval(interval); refreshController.current?.abort(); };
  }, []);
  useEffect(() => {
    if (!urlReady) return; const params = new URLSearchParams();
    if (query) params.set('q', query); keys.forEach(key => { if (filters[key]) params.set(key, filters[key]); });
    if (selectedPage) params.set('companion', selectedPage); if (sort !== 'name-asc') params.set('sort', sort); if (page > 1) params.set('page', String(page));
    window.history.replaceState(null, '', `${window.location.pathname}${params.size ? '?' + params.toString() : ''}`);
  }, [query, filters, selectedPage, sort, page, urlReady]);
  const options = useMemo(() => companionFilterOptions(data.companions), [data.companions]);
  const results = useMemo(() => findCompanions(data.companions, query, filters, sort), [data.companions, query, filters, sort]);
  const pageCount = Math.max(1, Math.ceil(results.length / pageSize)), currentPage = Math.min(page, pageCount);
  const visible = results.slice((currentPage - 1) * pageSize, currentPage * pageSize), selected = data.companions.find(companion => companion.page === selectedPage);
  const activeFilters = keys.filter(key => filters[key]).length;
  useEffect(() => {
    const dialog = detailDialog.current; if (!mobile || !selected || !dialog) return;
    const scrollY = window.scrollY, body = document.body;
    const saved = { position: body.style.position, top: body.style.top, width: body.style.width, overflow: body.style.overflow };
    dialog.showModal(); Object.assign(body.style, { position: 'fixed', top: `-${scrollY}px`, width: '100%', overflow: 'hidden' });
    return () => { dialog.close(); Object.assign(body.style, saved); window.scrollTo(0,scrollY); detailTrigger.current?.focus({ preventScroll: true }); };
  }, [mobile,selected?.page]);
  function updateFilter(key: keyof Filters, value: string) { setFilters(current => ({ ...current,[key]:value })); setPage(1); }
  function clearFilters() { setQuery(''); setFilters({ ...defaults }); setPage(1); }
  function choose(companion: Companion, trigger: HTMLElement) { detailTrigger.current = trigger; setSelectedPage(companion.page); if (!mobile && window.innerWidth < 1100) window.setTimeout(() => document.getElementById('companion-detail')?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }),0); }
  const filterValue = (key: keyof Filters) => filters[key] === '__none__' ? 'Not listed' : key === 'status' ? filters[key] === 'available' ? 'Available' : 'Unavailable' : filters[key];
  return <section className="fish-database companion-database" aria-label="Searchable companion database">
    <header className="fish-page-heading flex flex-wrap items-start justify-between gap-lg mb-lg"><div><p className="text-accent text-xs font-semibold uppercase tracking-wide mb-xs">Fischipedia data, easier to read</p><h1 className="text-3xl font-semibold tracking-tight">Companions</h1><p className="text-mute mt-xs">Find your next fishing companion. Compare abilities and how to obtain them.</p></div><div className="fish-source-summary"><span className={`fish-data-badge ${data.mode === 'snapshot' || error ? 'fish-data-badge-snapshot' : ''}`}>{loading ? 'Checking wiki data…' : error || data.mode === 'snapshot' ? 'Saved wiki snapshot' : 'Wiki API data'}</span><p>Source checked: {timestamp(data.fetchedAt)}</p><button className="fish-refresh" onClick={() => void refresh(true)} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh data'} <span aria-hidden="true">↻</span></button></div></header>
    {(error || !loading && data.notice) && <p className="fish-data-notice" role="status">{error || data.notice}</p>}
    <div className="fish-controls"><div className="fish-search-bar" id="companion-search-controls"><label className="fish-search"><SearchIcon/><span className="sr-only">Search companions, locations, food, or abilities</span><input type="search" placeholder={mobile ? 'Search companions or abilities' : 'Search a companion, food, or bonus — try Nico or Progress'} value={query} onChange={event => { setQuery(event.target.value);setPage(1); }} autoComplete="off"/>{query && <button onClick={() => { setQuery('');setPage(1); }} aria-label="Clear search">×</button>}</label><button className="fish-filter-toggle" ref={filterToggle} aria-expanded={filtersOpen} aria-controls="companion-filter-panel" onClick={() => setFiltersOpen(open => !open)}>Filters{activeFilters > 0 && <span>{activeFilters}</span>}</button></div>
    <div className="fish-filter-panel" id="companion-filter-panel" hidden={mobile && !filtersOpen}><div className="flex items-center justify-between gap-md mt-lg mb-sm"><h2 className="text-sm font-semibold">Filter companions</h2><button className="fish-clear" onClick={clearFilters} disabled={!activeFilters && !query}>Clear search & filters</button></div>
    <div className="fish-filters">{(Object.keys(options) as (keyof typeof options)[]).map(key => <label className="fish-filter" key={key}><span>{labels[key]}</span><select value={filters[key]} onChange={event => updateFilter(key,event.target.value)}><option value="">{`All ${key === 'region' ? 'locations' : key === 'event' ? 'events' : key === 'source' ? 'methods' : 'ability types'}`}</option><option value="__none__">{key === 'event' ? 'No event listed' : key === 'ability' ? 'No ability listed' : 'Not listed'}</option>{filters[key] && filters[key] !== '__none__' && !options[key].some(value => value === filters[key]) && <option value={filters[key]}>{filters[key]}</option>}{options[key].map(value => <option key={value} value={value}>{value}</option>)}</select></label>)}<label className="fish-filter"><span>Availability</span><select value={filters.status} onChange={event => updateFilter('status',event.target.value)}><option value="">All</option><option value="available">Available</option><option value="unavailable">Unavailable</option></select></label></div>
    <details className="fish-data-legend"><summary>How to read this data</summary><p>Open a companion’s details for ability conditions, cooldowns, base and max-level values, and obtainment requirements. Ability types follow the wiki’s categories; missing fields show “Not listed.” Food / bait is the wiki’s obtainment field, not a promise that every companion needs feeding.</p><p>Data is checked when this page opens and every 30 minutes, with a server cache of up to 30 minutes. Refresh data requests a new check, limited to once a minute per server instance. New wiki companions appear in search and filters automatically; only changed pages need their ability text fetched again. Failed checks retain the last successful data and source time. This is wiki data, not live game or server state.</p></details>
    <button className="fish-filter-done" onClick={() => { setFiltersOpen(false); filterToggle.current?.focus({ preventScroll:true }); window.requestAnimationFrame(() => document.getElementById('companion-search-controls')?.scrollIntoView({ block:'start' })); }}>Show {results.length.toLocaleString('en-US')} results</button></div>
    {(activeFilters > 0 || query) && <div className="fish-filter-chips" aria-label="Active search and filters">{query && <button onClick={() => { setQuery('');setPage(1); }} aria-label={`Remove search: ${query}`}><span>Search: {query}</span><span aria-hidden="true">×</span></button>}{keys.filter(key => filters[key]).map(key => <button key={key} onClick={() => updateFilter(key,'')} aria-label={`Remove ${labels[key]} filter`}><span>{labels[key]}: {filterValue(key)}</span><span aria-hidden="true">×</span></button>)}<button className="fish-chip-clear" onClick={clearFilters}>Clear all</button></div>}</div>
    <div className="fish-workspace"><div className="fish-results"><div className="fish-results-heading"><p role="status" aria-live="polite"><strong>{results.length.toLocaleString('en-US')}</strong> {results.length === 1 ? 'companion' : 'companions'}<span> of {data.companions.length.toLocaleString('en-US')} total</span></p><label className="fish-sort"><span>Sort</span><select value={sort} onChange={event => { setSort(event.target.value);setPage(1); }}><option value="name-asc">Name A–Z</option><option value="name-desc">Name Z–A</option><option value="region-asc">Location A–Z</option><option value="source-asc">Obtainment A–Z</option></select></label></div>
    {results.length ? <><div className="fish-table-scroll" tabIndex={0} role="region" aria-label="Companion results table; scroll for more columns"><table className="fish-table companion-table"><caption className="sr-only">Click anywhere in a row for details. Keyboard users can activate the companion name button.</caption><thead><tr>{['Companion','Location / event','Obtainment','Food / bait','Abilities'].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead><tbody>{visible.map(companion => <tr key={companion.id} onClick={event => choose(companion,event.currentTarget.querySelector<HTMLElement>('.fish-name') ?? event.currentTarget)} className={selectedPage === companion.page ? 'fish-row-selected' : ''}><td><button className="fish-name" onClick={event => { event.stopPropagation();choose(companion,event.currentTarget); }} aria-pressed={selectedPage === companion.page} aria-controls="companion-detail">{companion.name}</button>{companion.unavailable && <span className="fish-row-status">Unavailable</span>}</td><td>{listed(companion.region)}{companion.event && <span className="fish-row-note">{companion.event}</span>}</td><td>{listed(companion.source)}</td><td>{listed(companion.food)}</td><td className={companion.abilities.length ? '' : 'fish-missing'}><AbilitySummary companion={companion}/></td></tr>)}</tbody></table></div>
    <ul className="fish-mobile-cards" aria-label="Companion search results">{visible.map(companion => <li key={companion.id}><button className={`fish-mobile-card ${selectedPage === companion.page ? 'fish-card-selected' : ''}`} onClick={event => choose(companion,event.currentTarget)} aria-label={`View details for ${companion.name}`} aria-haspopup="dialog" aria-controls="companion-detail-dialog"><span className="fish-card-heading"><span className="fish-card-name">{companion.name}</span><span className="fish-card-arrow" aria-hidden="true">↗</span></span><span className="fish-card-region">{listed(companion.region)}</span><span className="fish-card-tags">{companion.source && <span className="fish-tag">{companion.source}</span>}{companion.event && <span className="fish-tag">{companion.event}</span>}<span className={`fish-tag ${companion.unavailable ? 'fish-tag-warning' : ''}`}>{companion.unavailable ? 'Unavailable' : 'Available'}</span></span><span className="fish-card-bait"><span>Food / bait</span><span>{listed(companion.food)}</span></span><span className="fish-card-bait"><span>Abilities</span><span><AbilitySummary companion={companion}/></span></span></button></li>)}</ul>
    <div className="fish-pagination"><p>{(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize,results.length)} of {results.length.toLocaleString('en-US')}</p><div className="flex items-center gap-sm"><button onClick={() => setPage(currentPage - 1)} disabled={currentPage === 1} aria-label="Previous page">←</button><span>Page {currentPage} of {pageCount}</span><button onClick={() => setPage(currentPage + 1)} disabled={currentPage === pageCount} aria-label="Next page">→</button></div></div></> : <div className="fish-results-empty"><SearchIcon/><h3>No companions match</h3><p>Try part of a companion name, food, or bonus, or remove a filter.</p><button className="btn-primary" onClick={clearFilters}>Clear search & filters</button></div>}
    <p className="fish-results-note">{mobile ? 'Tap a companion card for details.' : 'Click anywhere in a row for full abilities and obtainment details.'} Abilities and requirements are sourced from each companion’s wiki page.</p></div><div className="fish-detail-column">{!mobile && <Detail companion={selected} close={() => setSelectedPage('')}/>}{selectedPage && !selected && <p className="fish-data-notice">The linked companion was not found in this dataset.</p>}</div></div>
    {mobile && <dialog className="fish-detail-dialog" id="companion-detail-dialog" ref={detailDialog} aria-labelledby={selected ? 'companion-detail-title' : undefined} aria-label={selected ? undefined : 'Companion details'} onCancel={() => setSelectedPage('')} onClick={event => { if (event.target === event.currentTarget) setSelectedPage(''); }}><Detail companion={selected} close={() => setSelectedPage('')}/></dialog>}
    <noscript><p>Enable JavaScript to search, filter, and open companion details.</p></noscript>
  </section>;
}
