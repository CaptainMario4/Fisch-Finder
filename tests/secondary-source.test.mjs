import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { parsePage } from '../scripts/fandom-parser.mjs';
const code = ts.transpileModule(fs.readFileSync(new URL('../src/lib/secondary-source.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText.replace("import bundled from '../data/fandom-secondary.json';", 'const bundled = {};');
let counter = 0; const fresh = () => import('data:text/javascript;base64,' + Buffer.from(code + `\n// ${counter++}`).toString('base64'));
const stamp = () => new Date().toISOString();
const fixture = () => {
  const checkedAt = stamp(), source = { pageid: 999, title: 'New Fish', revisions: [{ revid: 1, timestamp: checkedAt, slots: { main: { content: '{{Fish|rarity=Exotic|location=New Island|bait=|time=Night|weather=|season=Winter}}' } } }] };
  return { schema: 1, checkedAt, fish: [parsePage('fish', source, { text: 'CC-BY-SA', url: 'https://www.fandom.com/licensing' })], rods: [] };
};
test('primary entries replace provisional data completely, including empty preferences and removed flags', async () => {
  const m = await fresh(), secondary = fixture().fish;
  const primary = { ...secondary[0], id: 88, url: 'https://fischipedia.org/wiki/New_Fish', secondary: undefined, bait: [], removed: true };
  const merged = m.mergeEntries([primary], secondary);
  assert.equal(merged.length, 1); assert.equal(merged[0], primary); assert.deepEqual(merged[0].bait, []); assert.equal(merged[0].removed, true);
  assert.equal(m.mergeEntries([], secondary, [primary]).length, 0, 'known primary entries do not resurrect through Fandom');
  assert.equal(m.identity('Shrimp (Fish)'), m.identity('Shrimp'));
  assert.equal(m.identity('Glitched Cap'), m.identity('Glitch Cap'));
  assert.notEqual(m.identity('Phantom Megalodon'), m.identity('Megalodon'));
  assert.equal(m.identity('🐟'), '🐟');
});
test('secondary cache is validated, shared, and retained on failure; primary outages add no new entries', async () => {
  const m = await fresh(), payload = fixture(); let requests = 0;
  const realFetch = globalThis.fetch, realNow = Date.now;
  try {
    globalThis.fetch = async url => { requests++; assert.equal(new URL(url).hostname, 'raw.githubusercontent.com'); return new Response(JSON.stringify(payload)); };
    const data = { fish: [], fetchedAt: stamp(), mode: 'api', notice: '' };
    const [one, two] = await Promise.all([m.withSecondary(data, 'fish', []), m.withSecondary(data, 'fish', [])]);
    assert.equal(requests, 1); assert.equal(one.fish.length, 1); assert.equal(two.fish.length, 1); assert.match(one.notice, /provisional/);
    assert.deepEqual(one.secondaryData, { source: 'fandom', checkedAt: payload.checkedAt, provisionalCount: 1 });
    const failed = await m.withSecondary({ ...data, mode: 'snapshot', notice: 'Primary unavailable' }, 'fish', []);
    assert.equal(failed.fish.length, 1); assert.equal(failed.fish[0].id, one.fish[0].id); assert.equal(requests, 1);
    const cold = await fresh(); const unchanged = await cold.withSecondary({ ...data, mode: 'snapshot' }, 'fish', []);
    assert.equal(unchanged.fish.length, 0); assert.equal(requests, 1);
    const primary = { ...payload.fish[0], id: 100, secondary: undefined, url: 'https://fischipedia.org/wiki/New_Fish' };
    const replaced = await m.withSecondary({ ...data, fish: [primary] }, 'fish', []);
    assert.equal(replaced.fish.length, 1); assert.equal(replaced.fish[0], primary); assert.equal(replaced.notice, '');
    assert.equal(replaced.secondaryData.provisionalCount, 0);
    Date.now = () => realNow() + 31 * 60 * 1000;
    globalThis.fetch = async () => { requests++; throw new Error('GitHub unavailable'); };
    const retained = await m.withSecondary(data, 'fish', []);
    assert.equal(retained.fish.length, 1); assert.equal(requests, 2);
    assert.equal(retained.fish[0].secondary.checkedAt, payload.checkedAt);
    const invalid = fixture(); invalid.fish[0].url = 'https://example.com'; assert.equal(m.validSecondary(invalid), false);
    invalid.fish[0] = { ...payload.fish[0], id: 999 }; assert.equal(m.validSecondary(invalid), false);
  } finally { globalThis.fetch = realFetch; Date.now = realNow; }
});
test('bundled secondary dataset passes schema and markup validation', async () => {
  const m = await fresh(), data = JSON.parse(fs.readFileSync(new URL('../src/data/fandom-secondary.json', import.meta.url), 'utf8'));
  assert.equal(m.validSecondary(data), true);
});
