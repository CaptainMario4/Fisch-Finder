import { fetchDataset, pollDataset } from '../lib/browser-dataset-cache';
import { useEffect, useState } from 'react';
import type { ScheduleData } from '../lib/schedules';
import { countdown, eventAt, nextHunt, seasonAt } from '../lib/schedules';

const wiki = (page: string) => 'https://fischipedia.org/wiki/' + encodeURIComponent(page.replace(/ /g, '_'));
function localTime(time: number) { return new Date(time).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }); }
function checked(time: string) { return new Date(time).toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC'); }
export default function ScheduleCards({ initialData, refreshSequence, onSeason }: { initialData: ScheduleData; refreshSequence: number; onSeason: (season: string) => void }) {
  const [data, setData] = useState(initialData), [now, setNow] = useState<number | null>(null), [checking, setChecking] = useState(true);
  const [mobile, setMobile] = useState(false), [seasonOpen, setSeasonOpen] = useState(false), [eventsOpen, setEventsOpen] = useState(false);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)');
    const sync = () => setMobile(media.matches);
    sync(); media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);
  useEffect(() => {
    let alive = true;
    async function refresh(force = false) {
      if (alive) setChecking(true);
      try {
        const next = await fetchDataset<ScheduleData>('/api/schedules.json', { force: force, signal: AbortSignal.timeout(22000), maxAge: 15 * 60 * 1000 }, next => !!next.hunts?.length && next.seasons?.length === 4 && !!next.seasonDuration);
        if (alive) setData(current => Date.parse(next.fetchedAt) < Date.parse(current.fetchedAt) ? { ...current, mode: next.mode } : next);
      } catch { if (alive) setData(current => ({ ...current, mode: 'snapshot' })); }
      finally { if (alive) setChecking(false); }
    }
    const stopRefresh = pollDataset('/api/schedules.json', () => refresh(), 15 * 60 * 1000, () => refresh(refreshSequence > 0));
    return () => { alive = false; stopRefresh(); };
  }, [refreshSequence]);
  useEffect(() => {
    const tick = () => setNow(Date.now()); tick();
    const interval = window.setInterval(tick, 1000);
    document.addEventListener('visibilitychange', tick);
    return () => { window.clearInterval(interval); document.removeEventListener('visibilitychange', tick); };
  }, []);
  const season = now === null ? undefined : seasonAt(data, now);
  const event = now === null ? undefined : eventAt(data.events, now);
  const eventActive = event && now !== null && event.start <= now;
  return <section className="fish-schedules" aria-label="Fisch schedules and countdowns">
    <div className="fish-schedule-grid">
      <article className="fish-schedule-card fish-schedule-hunts">
        <div className="fish-schedule-heading"><h2><span aria-hidden="true">🦈</span> Apex Hunts</h2><span className="fish-schedule-badge">Scheduled</span></div>
        <p className="fish-schedule-intro">Next global spawns</p>
        <ul className="fish-hunt-timers">{data.hunts.map(hunt => {
          const next = now === null ? undefined : nextHunt(hunt, now);
          return <li key={hunt.page}><a href={wiki(hunt.page)} target="_blank" rel="noopener noreferrer">{hunt.name} ↗</a><strong className="fish-countdown" aria-label={`${hunt.name} starts in ${next === undefined ? 'loading' : countdown(next, now!)}`}>{next === undefined ? 'Loading timer…' : countdown(next, now!)}</strong><span className="fish-schedule-date">{next === undefined ? 'Local start time loading' : localTime(next)}</span></li>;
        })}</ul>
        <p className="fish-schedule-note">Spawn timers do not confirm active hunts or remaining stock.</p>
      </article>
      <details className="fish-schedule-card fish-schedule-disclosure" open={!mobile || seasonOpen}>
        <summary className="fish-schedule-summary" tabIndex={mobile ? 0 : -1} onClick={event => { event.preventDefault(); if (mobile) setSeasonOpen(open => !open); }}><span className="fish-schedule-title" role="heading" aria-level={2}><span aria-hidden="true">🌦️</span> Current Season</span><span className="fish-schedule-preview">{season?.name ?? 'Loading…'}</span><span className="fish-disclosure-arrow" aria-hidden="true">⌄</span></summary>
        <div className="fish-schedule-content"><span className="fish-schedule-badge">Wiki clock</span>
        <p className="fish-season-name">{season?.name ?? 'Loading season…'}</p>
        <p className="fish-schedule-intro">{season ? `${season.next} starts in` : 'Next season'}</p>
        <strong className="fish-countdown fish-countdown-large">{season ? countdown(season.endsAt, now!) : 'Loading timer…'}</strong>
        <p className="fish-schedule-date">{season ? localTime(season.endsAt) : 'Local start time loading'}</p>
        <button className="fish-schedule-action" disabled={!season} onClick={() => season && onSeason(season.name)}>Show fish that prefer {season?.name ?? 'this season'} →</button>
        <div className="fish-server-conditions"><strong>Weather & day/night</strong><p>Server-specific; no live feed is available here. Use the filters below to match your server.</p></div>
        </div>
      </details>
      <details className="fish-schedule-card fish-schedule-disclosure" open={!mobile || eventsOpen}>
        <summary className="fish-schedule-summary" tabIndex={mobile ? 0 : -1} onClick={event => { event.preventDefault(); if (mobile) setEventsOpen(open => !open); }}><span className="fish-schedule-title" role="heading" aria-level={2}><span aria-hidden="true">📅</span> Upcoming Events</span><span className="fish-schedule-preview">{now === null ? 'Loading…' : event?.name ?? 'None listed'}</span><span className="fish-disclosure-arrow" aria-hidden="true">⌄</span></summary>
        <div className="fish-schedule-content"><span className="fish-schedule-badge">Wiki dates</span>
        {now === null ? <p className="fish-event-name">Checking event dates…</p> : event ? <><p className="fish-event-name">{event.name}</p><p className="fish-schedule-intro">{eventActive ? 'Scheduled to end in' : 'Starts in'}</p><strong className="fish-countdown fish-countdown-large">{countdown(eventActive ? event.end : event.start, now)}</strong><p className="fish-schedule-date">{localTime(eventActive ? event.end : event.start)}</p><p className="fish-schedule-note">Dates listed on Fischipedia; in-game status is not verified.</p></> : <><p className="fish-event-name">No upcoming event listed</p><p className="fish-event-description">The wiki’s upcoming-event list has no current or future event dates. Ended events are hidden.</p></>}
        <a className="fish-schedule-action fish-event-link" href={wiki('Events')} target="_blank" rel="noopener noreferrer">Browse Fischipedia events ↗</a>
        </div>
      </details>
    </div>
    <div className="fish-schedule-source"><p>{checking ? 'Checking wiki schedules…' : data.mode === 'snapshot' ? 'Saved schedules · Wiki refresh unavailable' : 'Wiki schedules'}<span> · Source checked: {checked(data.fetchedAt)}</span></p><a href={wiki('Fisch_Wiki')} target="_blank" rel="noopener noreferrer">Fischipedia counters ↗</a></div>
  </section>;
}
