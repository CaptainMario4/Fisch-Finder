import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const snapshot = JSON.parse(fs.readFileSync(new URL('../src/data/rods-snapshot.json', import.meta.url), 'utf8'));
const compiled = ts.transpileModule(fs.readFileSync(new URL('../src/lib/rods.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText.replace("import snapshot from '../data/rods-snapshot.json';", `const snapshot = ${JSON.stringify(snapshot)};`);
let moduleId = 0;
const fresh = () => import('data:text/javascript;base64,' + Buffer.from(compiled + `\n// test ${moduleId++}`).toString('base64'));

test('wiki recommendations retain nested links, mastery conditions, alternatives, and source categories', async () => {
  const mod = await fresh();
  const advice = mod.extractRecommendations(`{{RodInfobox|stage=5}}
    {{Enchanting
    |optimal1={{Enchantment|Swift}} if '''[[Mastery|Mastery Enhancement]]''' is unlocked.
    |misc1={{Enchantment|Herculean}} for control.
    |miscnote1={{Enchantment|Unbreakable}} if {{Fish|Exalted Relic|ni=1}} is unavailable.
    |keeper1={{Enchantment|Sea King}} for weight.
    }}`);
  assert.equal(advice[0].text, 'Swift if Mastery Enhancement is unlocked.');
  assert.equal(advice[1].note, 'Unbreakable if Exalted Relic is unavailable.');
  assert.deepEqual(advice[1].enchants, ['Herculean', 'Unbreakable']);
  assert.equal(advice[2].group, 'Keeperbound');
  assert.deepEqual(mod.extractRecommendations('No advice here'), []);
  const trident = mod.rodFallback.rods.find(rod => rod.page === 'Trident Rod');
  assert.equal(trident.stage, 'Stage 5'); assert.equal(trident.lure, '35%');
  assert.equal(trident.control, '0.05'); assert.equal(trident.resilience, '0%');
  assert.match(trident.recommendations[1].text, /Mastery Enhancement/);
  assert.ok(mod.rodFallback.rods.every(rod => !JSON.stringify(rod).match(/\{\{|\[\[/)));
});

test('normalization preserves zero stats, exclusive and new stages, missing advice, and wiki availability flags', async () => {
  const mod = await fresh();
  const rods = mod.normalizeRods([
    { page_id: 1, page_name: 'New Rod', stage: 12, luck: 0, control: 0, is_unob: '' },
    { page_id: 2, page_name: 'Exclusive Rod', stage: 0, price: 199, price_type: 'Robux' },
    { page_id: 3, page_name: 'Unknown Rod' },
  ], {});
  assert.equal(rods.find(r => r.id === 1).stage, 'Stage 12');
  assert.equal(rods.find(r => r.id === 1).luck, '0%');
  assert.equal(rods.find(r => r.id === 1).unavailable, true);
  assert.equal(rods.find(r => r.id === 2).stage, 'Stage 0 / Exclusive');
  assert.equal(rods.find(r => r.id === 2).price, '199 Robux');
  assert.equal(rods.find(r => r.id === 3).stage, 'Not listed');
  assert.deepEqual(rods.find(r => r.id === 3).recommendations, []);
});

test('refresh checks revision IDs, fetches only changed advice, caches, and retains data on incomplete failures', async () => {
  const realFetch = globalThis.fetch, RealDate = globalThis.Date;
  let clock = RealDate.parse(snapshot.fetchedAt) + 3600000;
  globalThis.Date = class extends RealDate { constructor(...args) { super(...(args.length ? args : [clock])); } static now() { return clock; } };
  try {
    const mod = await fresh(); let requests = 0, contentRequests = 0;
    const raw = [...snapshot.rods, { page_id: 999999, page_name: 'New Test Rod', stage: 12, lure: 100 }];
    globalThis.fetch = async url => {
      requests++; const params = new URL(url).searchParams;
      if (params.get('action') === 'bucket') return { ok: true, json: async () => ({ bucket: raw }) };
      const content = params.get('rvprop').includes('content'); if (content) contentRequests++;
      return { ok: true, json: async () => ({ query: { pages: params.get('pageids').split('|').map(id => ({
        pageid: Number(id), revisions: [{ revid: id === '999999' ? 42 : snapshot.sources[id].revision,
          ...(content ? { slots: { main: { content: '{{Enchanting|optimal1={{Enchantment|Hasty}} for speed.}}' } } } : {}),
        }],
      })) } }) };
    };
    const [first, concurrent] = await Promise.all([mod.getRodDataset(), mod.getRodDataset({ forceRefresh: true })]);
    assert.equal(first, concurrent); assert.equal(first.mode, 'api'); assert.equal(first.rods.length, 265);
    assert.equal(first.rods.find(r => r.id === 999999).stage, 'Stage 12');
    assert.deepEqual(first.rods.find(r => r.id === 999999).recommendations[0].enchants, ['Hasty']);
    assert.equal(contentRequests, 1); const initialRequests = requests;
    clock += 10000; await mod.getRodDataset({ forceRefresh: true }); assert.equal(requests, initialRequests);
    clock += 61000; const refreshed = await mod.getRodDataset({ forceRefresh: true });
    assert.equal(contentRequests, 1); assert.notEqual(refreshed.fetchedAt, first.fetchedAt);
    clock += 61000; globalThis.fetch = async () => ({ ok: true, json: async () => ({ bucket: raw.slice(0,2) }) });
    const failed = await mod.getRodDataset({ forceRefresh: true });
    assert.equal(failed.mode, 'snapshot'); assert.equal(failed.fetchedAt, refreshed.fetchedAt);
    assert.deepEqual(failed.rods, refreshed.rods);
    const freshMod = await fresh(); globalThis.fetch = async () => { throw new Error('Source unavailable'); };
    const fallback = await freshMod.getRodDataset(); assert.equal(fallback.fetchedAt, snapshot.fetchedAt);
    assert.equal(fallback.rods.length, 264);
  } finally { globalThis.fetch = realFetch; globalThis.Date = RealDate; }
});
