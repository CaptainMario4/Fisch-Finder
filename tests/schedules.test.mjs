import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const snapshot = JSON.parse(fs.readFileSync(new URL('../src/data/schedules-snapshot.json', import.meta.url), 'utf8'));
const source = fs.readFileSync(new URL('../src/lib/schedules.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
  .replace("import snapshot from '../data/schedules-snapshot.json';", `const snapshot = ${JSON.stringify(snapshot)};`);
let id = 0;
const fresh = () => import('data:text/javascript;base64,' + Buffer.from(compiled + `\n// ${id++}`).toString('base64'));

test('schedule module initializes when the browser only accepts ISO timestamps', async () => {
  const realParse = Date.parse;
  try {
    // Nonstandard wiki dates are not portable. Simulate a strict date parser
    // during module initialization, where a failure prevents React hydration.
    Date.parse = value => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value)
      ? realParse(value) : NaN;
    const m = await fresh();
    assert.equal(m.scheduleFallback.events[0].start, realParse('2026-06-20T16:00:00Z'));
    assert.equal(m.scheduleFallback.events[0].end, realParse('2026-09-12T16:00:00Z'));
  } finally { Date.parse = realParse; }
});

test('source parsing and clock boundaries', async () => {
  const m = await fresh(), d = m.scheduleFallback;
  assert.deepEqual(d.hunts.map(h => [h.name, h.period]), [['Mosslurker', 14400], ['Narwhal Migration', 10800], ['Dreadfin', 12600]]);
  assert.equal(d.seasonDuration, 34560);
  assert.equal(m.wikiDate('2026-06-20 16:00:00 UTC'), Date.parse('2026-06-20T16:00:00Z'));
  assert.equal(m.wikiDate('2026-06-20T12:00:00-04:00'), Date.parse('2026-06-20T16:00:00Z'));
  assert.ok(Number.isNaN(m.wikiDate('2026-06-20 16:00:00')));
  assert.ok(Number.isNaN(m.wikiDate('Not a date')));
  const springEnd = d.seasonDuration * 1000;
  assert.equal(m.seasonAt(d, springEnd - 1).name, 'Spring');
  assert.equal(m.seasonAt(d, springEnd).name, 'Summer');
  assert.equal(m.seasonAt(d, springEnd * 4).name, 'Spring');
  const h = d.hunts[0], spawn = h.period * 1000;
  assert.equal(m.nextHunt(h, spawn - 1), spawn);
  assert.equal(m.nextHunt(h, spawn), spawn * 2);
  assert.equal(m.countdown(spawn, spawn + 1), '0h 00m 00s');
  assert.equal(m.countdown(spawn, spawn - 1001), '0h 00m 02s');
  assert.equal(m.eventAt(d.events, Date.parse('2026-10-06T22:00:00Z')), undefined);
  const events = [{ name: 'Future', start: 2000, end: 3000 }, { name: 'Active', start: 1000, end: 2000 }];
  assert.equal(m.eventAt(events, 1500).name, 'Active');
  assert.equal(m.eventAt(events, 2000).name, 'Future');
  assert.equal(m.eventAt(events, 3000), undefined);
  assert.throws(() => m.parseSchedules({ query: { pages: {} } }, d.fetchedAt));
});

test('schedule refresh preserves source time on failure and retries on manual refresh', async () => {
  const m = await fresh(), realFetch = globalThis.fetch;
  let calls = 0;
  const RealDate = Date; let clock = RealDate.now();
  globalThis.Date = class extends RealDate { constructor(...args) { super(...(args.length ? args : [clock])); } static now() { return clock; } };
  try {
    globalThis.fetch = async () => { calls++; return { ok: true, json: async () => snapshot }; };
    const first = await m.getSchedules();
    assert.equal(first.mode, 'api');
    await m.getSchedules(); assert.equal(calls, 1);
    await m.getSchedules(true); assert.equal(calls, 1);
    clock += 61_000;
    globalThis.fetch = async () => { calls++; throw new Error('Offline'); };
    const failed = await m.getSchedules(true);
    assert.equal(failed.mode, 'snapshot');
    assert.equal(failed.fetchedAt, first.fetchedAt);
    assert.deepEqual(failed.hunts, first.hunts);
    globalThis.fetch = async () => { calls++; return { ok: true, json: async () => ({ error: 'Bad source format' }) }; };
    clock += 61_000;
    const incompatible = await m.getSchedules(true);
    assert.equal(incompatible.fetchedAt, first.fetchedAt);
    assert.equal(incompatible.mode, 'snapshot'); assert.equal(calls, 3);
  } finally { globalThis.fetch = realFetch; globalThis.Date = RealDate; }
});
