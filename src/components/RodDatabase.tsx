import { replaceFinderUrl, listenForFinderHistory } from '../lib/finder-history';
import { fetchDataset, pollDataset } from '../lib/browser-dataset-cache';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Rod, RodDataset } from '../lib/rods';
import RodDetails from './RodDetails';
import RodObtainmentViewer from './RodObtainmentViewer';
import '../styles/fish-database.css';
import '../styles/rod-database.css';

type Filters = { stage: string; region: string; source: string; enchant: string; status: string };
const defaults: Filters = { stage: '', region: '', source: '', enchant: '', status: '' };
const labels: Record<keyof Filters, string> = { stage: 'Stage', region: 'Journal / region', source: 'Obtainment', enchant: 'Enchantment', status: 'Availability' };
const keys = Object.keys(defaults) as (keyof Filters)[];
const searchText = (value: string) => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const listed = (value: string) => value || 'Not listed';
const names = (rod: Rod) => [...new Set(rod.recommendations.flatMap(advice => advice.enchants))];
const stageNumber = (rod: Rod) => Number(rod.stage.match(/\d+/)?.[0] ?? 999);
const numeric = (value: string) => /inf|∞/i.test(value) ? Infinity : Number(value.replace(/[^\d.+-]/g, '')) || 0;
const pageSize = 25;
function timestamp(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? 'Not recorded' : date.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, ' UTC'); }
function SearchIcon() { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="10.8" cy="10.8" r="7.3"/><path d="m16.2 16.2 4.3 4.3"/></svg>; }

function EnchantSummary({ rod }: { rod: Rod }) {
  const enchants = names(rod);
  return enchants.length ? <>{enchants.slice(0, 4).join(', ')}{enchants.length > 4 && <span className="fish-row-note">+{enchants.length - 4} more in details</span>}</> : <>No recommendation listed</>;
}

export default function RodDatabase({ initialData }: { initialData: RodDataset }) {
  const [data, setData] = useState(initialData), [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [query, setQuery] = useState(''), [filters, setFilters] = useState<Filters>({ ...defaults });
  const [selectedPage, setSelectedPage] = useState(''), [page, setPage] = useState(1), [sort, setSort] = useState('name-asc'), [urlReady, setUrlReady] = useState(false);
  const [recipePage, setRecipePage] = useState('');
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
      const next = await fetchDataset<RodDataset>('/api/rods.json?schema=4', { force: force, signal: controller.signal, maxAge: 30 * 60 * 1000 }, next => Array.isArray(next.rods) && next.rods.length > 0 && next.rods.every(rod => Array.isArray(rod.abilities) && Array.isArray(rod.mastery) && Array.isArray(rod.recommendations) && (rod.secondary || rod.obtainment && Array.isArray(rod.obtainment.sections) && Array.isArray(rod.obtainment.references))));
      setData(current => Date.parse(next.fetchedAt) < Date.parse(current.fetchedAt) ? { ...current, mode: next.mode, notice: next.notice } : next);
    } catch { if (refreshController.current === controller) setError('Refresh unavailable. The saved rods remain searchable with their original source timestamp.'); }
    finally { window.clearTimeout(timeout); if (refreshController.current === controller) setLoading(false); }
  }
  useEffect(() => {
    const readUrl = () => {
      const params = new URLSearchParams(window.location.search), restored = { ...defaults };
      setQuery(params.get('q') || ''); setSelectedPage(params.get('rod') || ''); setRecipePage(params.get('obtain') || params.get('rod') || '');
      setSort(['name-asc','name-desc','stage-asc','lure-desc','luck-desc'].includes(params.get('sort') ?? '') ? params.get('sort')! : 'name-asc');
      const requestedPage = Number(params.get('page')); setPage(Number.isFinite(requestedPage) ? Math.max(1, Math.floor(requestedPage)) : 1);
      keys.forEach(key => restored[key] = params.get(key) ?? ''); setFilters(restored); setUrlReady(true);
    };
    readUrl(); const stopRefresh = pollDataset('/api/rods.json?schema=3', () => refresh(), 30 * 60 * 1000);
    const stopHistory = listenForFinderHistory(readUrl);
    return () => { stopHistory(); stopRefresh(); refreshController.current?.abort(); };
  }, []);
  useEffect(() => {
    if (!urlReady) return; const params = new URLSearchParams();
    if (query) params.set('q', query); keys.forEach(key => { if (filters[key]) params.set(key, filters[key]); });
    if (selectedPage) params.set('rod', selectedPage); if (recipePage) params.set('obtain', recipePage); if (sort !== 'name-asc') params.set('sort', sort); if (page > 1) params.set('page', String(page));
    replaceFinderUrl(`${window.location.pathname}${params.size ? '?' + params.toString() : ''}`);
  }, [query, filters, selectedPage, recipePage, sort, page, urlReady]);
  const options = useMemo(() => {
    const values = (key: 'stage' | 'region' | 'source') => [...new Set(data.rods.map(rod => rod[key]).filter(Boolean))].sort((a,b) => key === 'stage' ? Number(a.match(/\d+/)?.[0] ?? 999) - Number(b.match(/\d+/)?.[0] ?? 999) : a.localeCompare(b));
    return { stage: values('stage'), region: values('region'), source: values('source'), enchant: [...new Set(data.rods.flatMap(names))].sort((a,b) => a.localeCompare(b)) };
  }, [data.rods]);
  const results = useMemo(() => data.rods.filter(rod => {
    const needle = searchText(query);
    if (needle && ![rod.name,rod.region,rod.source,rod.stage,...names(rod)].some(value => searchText(value).includes(needle))) return false;
    for (const key of ['stage','region','source'] as const) if (filters[key] && filters[key] !== rod[key]) return false;
    if (filters.enchant === '__none__' ? rod.recommendations.length > 0 : filters.enchant && !names(rod).includes(filters.enchant)) return false;
    return !(filters.status === 'available' && rod.unavailable || filters.status === 'unavailable' && !rod.unavailable);
  }).sort((a,b) => (sort === 'name-desc' ? b.name.localeCompare(a.name) : sort === 'stage-asc' ? stageNumber(a) - stageNumber(b) : sort === 'lure-desc' ? numeric(b.lure) - numeric(a.lure) : sort === 'luck-desc' ? numeric(b.luck) - numeric(a.luck) : 0) || a.name.localeCompare(b.name)), [data.rods,query,filters,sort]);
  const pageCount = Math.max(1, Math.ceil(results.length / pageSize)), currentPage = Math.min(page, pageCount);
  const visible = results.slice((currentPage - 1) * pageSize, currentPage * pageSize), selected = data.rods.find(rod => rod.page === selectedPage);
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
  function choose(rod: Rod, trigger: HTMLElement) { detailTrigger.current = trigger; setSelectedPage(rod.page); setRecipePage(rod.page); if (!mobile && window.innerWidth < 1100) window.setTimeout(() => document.getElementById('rod-detail')?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }),0); }
  function showObtainment() {
    if (!selected) return; setRecipePage(selected.page); if (mobile) setSelectedPage('');
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      const viewer = document.getElementById('rod-obtainment-viewer');
      viewer?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
      viewer?.focus({ preventScroll: true });
    }));
  }
  const filterValue = (key: keyof Filters) => filters[key] === '__none__' ? 'No recommendation listed' : key === 'status' ? filters[key] === 'available' ? 'Available' : 'Unavailable' : filters[key];
  return <section className="fish-database rod-database" aria-label="Searchable rod database">
    <header className="fish-page-heading flex flex-wrap items-start justify-between gap-lg mb-lg"><div><p className="text-accent text-xs font-semibold uppercase tracking-wide mb-xs">Fischipedia data, easier to read</p><h1 className="text-3xl font-semibold tracking-tight">Rod Finder</h1><p className="text-mute mt-xs">Find your next rod. Compare stats and preferred enchants.</p></div><div className="fish-source-summary"><span className={`fish-data-badge ${data.mode === 'snapshot' || error ? 'fish-data-badge-snapshot' : ''}`}>{loading ? 'Checking wiki data…' : error || data.mode === 'snapshot' ? 'Saved wiki snapshot' : 'Wiki API data'}</span><p>Source checked: {timestamp(data.fetchedAt)}</p><button className="fish-refresh" onClick={() => void refresh(true)} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh data'} <span aria-hidden="true">↻</span></button></div></header>
    {(error || !loading && data.notice) && <p className="fish-data-notice" role="status">{error || data.notice}</p>}
    <div className="fish-controls"><div className="fish-search-bar" id="rod-search-controls"><label className="fish-search"><SearchIcon/><span className="sr-only">Search rods, regions, or enchants</span><input type="search" placeholder={mobile ? 'Search rods or enchants' : 'Search a rod, region, or enchant — try Trident or Hasty'} value={query} onChange={event => { setQuery(event.target.value);setPage(1); }} autoComplete="off"/>{query && <button onClick={() => { setQuery('');setPage(1); }} aria-label="Clear search">×</button>}</label><button className="fish-filter-toggle" ref={filterToggle} aria-expanded={filtersOpen} aria-controls="rod-filter-panel" onClick={() => setFiltersOpen(open => !open)}>Filters{activeFilters > 0 && <span>{activeFilters}</span>}</button></div>
    <div className="fish-filter-panel" id="rod-filter-panel" hidden={mobile && !filtersOpen}><div className="flex items-center justify-between gap-md mt-lg mb-sm"><h2 className="text-sm font-semibold">Filter rods</h2><button className="fish-clear" onClick={clearFilters} disabled={!activeFilters && !query}>Clear search & filters</button></div>
    <div className="fish-filters">{(Object.keys(options) as (keyof typeof options)[]).map(key => <label className="fish-filter" key={key}><span>{labels[key]}</span><select value={filters[key]} onChange={event => updateFilter(key,event.target.value)}><option value="">{key === 'stage' ? 'All stages' : `All ${key === 'region' ? 'regions' : key === 'source' ? 'methods' : 'enchants'}`}</option>{key === 'enchant' && <option value="__none__">No recommendation listed</option>}{filters[key] && filters[key] !== '__none__' && !options[key].includes(filters[key]) && <option value={filters[key]}>{filters[key]}</option>}{options[key].map(value => <option key={value} value={value}>{value}</option>)}</select></label>)}<label className="fish-filter"><span>Availability</span><select value={filters.status} onChange={event => updateFilter('status',event.target.value)}><option value="">All</option><option value="available">Available</option><option value="unavailable">Unavailable</option></select></label></div>
    <details className="fish-data-legend"><summary>How to read this data</summary><p>Stages describe Fischipedia’s subjective obtainment difficulty, rather than a strict ranking. Stage 0 contains exclusive rods. Empty fields show “Not listed”; empty advice shows “No recommendation listed.” Enchant recommendations can depend on mastery, goals, and available relics; open a rod’s details for the full notes.</p><p>Data is checked when this page opens and every 30 minutes, with a server cache of up to 30 minutes. Refresh data requests a new check, limited to once a minute per server instance. Changed wiki revisions update recommendations and new rods appear in search and filters automatically. The source time advances only after a successful check. This is wiki data, not live game or server state.</p></details>
    <button className="fish-filter-done" onClick={() => { setFiltersOpen(false); filterToggle.current?.focus({ preventScroll:true }); window.requestAnimationFrame(() => document.getElementById('rod-search-controls')?.scrollIntoView({ block:'start' })); }}>Show {results.length.toLocaleString('en-US')} results</button></div>
    {(activeFilters > 0 || query) && <div className="fish-filter-chips" aria-label="Active search and filters">{query && <button onClick={() => { setQuery('');setPage(1); }} aria-label={`Remove search: ${query}`}><span>Search: {query}</span><span aria-hidden="true">×</span></button>}{keys.filter(key => filters[key]).map(key => <button key={key} onClick={() => updateFilter(key,'')} aria-label={`Remove ${labels[key]} filter`}><span>{labels[key]}: {filterValue(key)}</span><span aria-hidden="true">×</span></button>)}<button className="fish-chip-clear" onClick={clearFilters}>Clear all</button></div>}</div>
    <div className="fish-workspace"><div className="fish-results"><div className="fish-results-heading"><p role="status" aria-live="polite"><strong>{results.length.toLocaleString('en-US')}</strong> {results.length === 1 ? 'rod' : 'rods'}<span> of {data.rods.length.toLocaleString('en-US')} total</span></p><label className="fish-sort"><span>Sort</span><select value={sort} onChange={event => { setSort(event.target.value);setPage(1); }}><option value="name-asc">Name A–Z</option><option value="name-desc">Name Z–A</option><option value="stage-asc">Stage: low to high</option><option value="lure-desc">Highest lure speed</option><option value="luck-desc">Highest luck</option></select></label></div>
    {results.length ? <><div className="fish-table-scroll" tabIndex={0} role="region" aria-label="Rod results table; scroll for more columns"><table className="fish-table rod-table"><caption className="sr-only">Click anywhere in a row for details. Keyboard users can activate the rod name button.</caption><thead><tr>{['Rod','Stage','Lure speed','Luck','Obtainment','Preferred enchants'].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead><tbody>{visible.map(rod => <tr key={rod.id} onClick={event => choose(rod,event.currentTarget.querySelector<HTMLElement>('.fish-name') ?? event.currentTarget)} className={selectedPage === rod.page ? 'fish-row-selected' : ''}><td><button className="fish-name" onClick={event => { event.stopPropagation();choose(rod,event.currentTarget); }} aria-pressed={selectedPage === rod.page} aria-controls="rod-detail">{rod.name}</button><span className="fish-row-note">{listed(rod.region)}</span>{rod.secondary && <span className="fish-row-note">Fandom · provisional</span>}{rod.unavailable && <span className="fish-row-status">Unavailable</span>}</td><td>{rod.stage}</td><td>{listed(rod.lure)}</td><td>{listed(rod.luck)}</td><td>{listed(rod.source)}<span className="fish-row-note">{listed(rod.price)}</span></td><td className={rod.recommendations.length ? '' : 'fish-missing'}><EnchantSummary rod={rod}/></td></tr>)}</tbody></table></div>
    <ul className="fish-mobile-cards" aria-label="Rod search results">{visible.map(rod => <li key={rod.id}><button className={`fish-mobile-card ${selectedPage === rod.page ? 'fish-card-selected' : ''}`} onClick={event => choose(rod,event.currentTarget)} aria-label={`View details for ${rod.name}`} aria-haspopup="dialog" aria-controls="rod-detail-dialog"><span className="fish-card-heading"><span className="fish-card-name">{rod.name}</span><span className="fish-card-arrow" aria-hidden="true">↗</span></span><span className="fish-card-region">{listed(rod.region)}</span><span className="fish-card-tags"><span className="fish-tag">{rod.stage}</span><span className={`fish-tag ${rod.unavailable ? 'fish-tag-warning' : ''}`}>{rod.unavailable ? 'Unavailable' : 'Available'}</span>{rod.secondary && <span className="fish-tag">Fandom · provisional</span>}</span><span className="rod-card-stats"><span>Lure <strong>{listed(rod.lure)}</strong></span><span>Luck <strong>{listed(rod.luck)}</strong></span></span><span className="fish-card-bait"><span>Enchants</span><span><EnchantSummary rod={rod}/></span></span></button></li>)}</ul>
    <div className="fish-pagination"><p>{(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize,results.length)} of {results.length.toLocaleString('en-US')}</p><div className="flex items-center gap-sm"><button onClick={() => setPage(currentPage - 1)} disabled={currentPage === 1} aria-label="Previous page">←</button><span>Page {currentPage} of {pageCount}</span><button onClick={() => setPage(currentPage + 1)} disabled={currentPage === pageCount} aria-label="Next page">→</button></div></div></> : <div className="fish-results-empty"><SearchIcon/><h3>No rods match</h3><p>Try part of a rod name or enchant, or remove a filter.</p><button className="btn-primary" onClick={clearFilters}>Clear search & filters</button></div>}
    <p className="fish-results-note">{mobile ? 'Tap a rod card for details.' : 'Click anywhere in a row for all stats and details.'} Recommendations are sourced from each rod’s wiki page.</p></div><div className="fish-detail-column">{!mobile && <RodDetails rod={selected} close={() => setSelectedPage('')} showObtainment={showObtainment}/>}{selectedPage && !selected && <p className="fish-data-notice">The linked rod was not found in this dataset.</p>}</div></div>
    <RodObtainmentViewer rod={data.rods.find(rod => rod.page === recipePage)} rods={data.rods} select={setRecipePage} loading={loading}/>
    {mobile && <dialog className="fish-detail-dialog" id="rod-detail-dialog" ref={detailDialog} aria-labelledby={selected ? 'rod-detail-title' : undefined} aria-label={selected ? undefined : 'Rod details'} onCancel={() => setSelectedPage('')} onClick={event => { if (event.target === event.currentTarget) setSelectedPage(''); }}><RodDetails rod={selected} close={() => setSelectedPage('')} showObtainment={showObtainment}/></dialog>}
  </section>;
}
