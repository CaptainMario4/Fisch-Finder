import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const snapshot = JSON.parse(fs.readFileSync(new URL('../src/data/fisch-snapshot.json', import.meta.url), 'utf8'));
const source = fs.readFileSync(new URL('../src/lib/fisch.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
  .replace("import snapshot from '../data/fisch-snapshot.json';", `const snapshot = ${JSON.stringify(snapshot)};`);
let moduleId = 0;
const freshModule = () => import('data:text/javascript;base64,' + Buffer.from(compiled + `\n// fixture ${moduleId++}`).toString('base64'));
const RealDate = Date;
const realFetch = fetch;
let clock = RealDate.parse('2026-10-06T22:00:00Z');
class TestDate extends RealDate {
  constructor(...args) { super(...(args.length ? args : [clock])); }
  static now() { return clock; }
}
const success = (url) => ({ ok: true, json: async () => ({ bucket: new URL(url).searchParams.get('query').includes('fish_availability') ? snapshot.availability : snapshot.fish }) });

test('admin events display separately with their original percentages', async () => {
  const mod = await freshModule();
  const raw = [{ page_id: 1, page_name: 'Test fish' }];
  const fish = mod.normalize(raw, [{ page_id: 1, admin_events: 'EMOJIS!\\1%;; MADNESS\\3%;;\nDivine Dream\\0.067%;; Plain event' }])[0];
  assert.deepEqual(fish.adminEvents, ['EMOJIS! — 1%', 'MADNESS — 3%', 'Divine Dream — 0.067%', 'Plain event']);
  assert.deepEqual(mod.normalize(raw, [])[0].adminEvents, []);
  const emoji = mod.fallback.fish.find(f => f.page === '🐟');
  assert.equal(emoji.adminEvents.length, 10);
  assert.equal(emoji.adminEvents[0], 'EMOJIS! — 1%');
  assert.equal(emoji.adminEvents[7], '🐟 (Admin Event) — 1%');
  assert.equal(emoji.adminEvents[9], 'Gurt Dream — 7%');
  assert.ok(mod.fallback.fish.every(f => f.adminEvents.every(event => !event.includes(';;') && !event.includes('\\'))));
});

test('automatic cache, explicit refresh, and source timestamps', async t => {
  globalThis.Date = TestDate;
  try {
    await t.test('automatic reads reuse the cache; manual refresh fetches and advances the source time', async () => {
      const mod = await freshModule(); let requests = 0;
      globalThis.fetch = async (url, options) => { requests++; assert.equal(options.cache, 'no-store'); return success(url); };
      const first = await mod.getDataset();
      clock += 10_000;
      const cached = await mod.getDataset();
      assert.equal(requests, 2); assert.equal(cached.fetchedAt, first.fetchedAt);
      const throttled = await mod.getDataset({ forceRefresh: true });
      assert.equal(requests, 2); assert.equal(throttled.fetchedAt, first.fetchedAt);
      clock += 60_000;
      const refreshed = await mod.getDataset({ forceRefresh: true });
      assert.equal(requests, 4); assert.equal(refreshed.fetchedAt, new RealDate(clock).toISOString());
      assert.notEqual(refreshed.fetchedAt, first.fetchedAt); assert.equal(refreshed.mode, 'api');
    });
    await t.test('failed refresh retains the last successful timestamp and fish data', async () => {
      const mod = await freshModule(); globalThis.fetch = async url => success(url);
      const first = await mod.getDataset(); clock += 61_000;
      globalThis.fetch = async () => { throw new Error('Wiki unavailable'); };
      const failed = await mod.getDataset({ forceRefresh: true });
      assert.equal(failed.fetchedAt, first.fetchedAt); assert.deepEqual(failed.fish, first.fish);
      assert.equal(failed.mode, 'snapshot'); assert.match(failed.notice, /unavailable/i);
    });
    await t.test('failed initial check keeps the bundled snapshot timestamp', async () => {
      const mod = await freshModule(); globalThis.fetch = async () => { throw new Error('Wiki unavailable'); };
      const failed = await mod.getDataset({ forceRefresh: true });
      assert.equal(failed.fetchedAt, snapshot.fetchedAt); assert.equal(failed.mode, 'snapshot');
    });
    await t.test('concurrent refreshes share an in-flight source check', async () => {
      const mod = await freshModule(); let requests = 0; let release;
      const gate = new Promise(resolve => { release = resolve; });
      globalThis.fetch = async url => { requests++; await gate; return success(url); };
      const first = mod.getDataset({ forceRefresh: true });
      const second = mod.getDataset({ forceRefresh: true });
      const automatic = mod.getDataset();
      assert.equal(requests, 2); release();
      const values = await Promise.all([first, second, automatic]);
      assert.equal(requests, 2); assert.equal(values[0], values[1]); assert.equal(values[0], values[2]);
    });
  } finally { globalThis.Date = RealDate; globalThis.fetch = realFetch; }
});
