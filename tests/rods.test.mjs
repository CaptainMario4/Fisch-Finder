import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const dataUri=code=>'data:text/javascript;base64,'+Buffer.from(code).toString('base64');
const compileFile=path=>ts.transpileModule(fs.readFileSync(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const wikiUri=dataUri(compileFile('../src/lib/quest-wiki.ts'));
const obtainUri=dataUri(compileFile('../src/lib/rod-obtainment.ts').replace("from './quest-wiki'", "from '"+wikiUri+"'"));

const snapshot = JSON.parse(fs.readFileSync(new URL('../src/data/rods-snapshot.json', import.meta.url), 'utf8'));
const compiled = ts.transpileModule(fs.readFileSync(new URL('../src/lib/rods.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText.replace("import snapshot from '../data/rods-snapshot.json';", `const snapshot = ${JSON.stringify(snapshot)};`).replace("from './rod-obtainment'", "from '"+obtainUri+"'");
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
  const paired = mod.extractRecommendations('{{Enchanting|optimal1={{Enchantment|Blessed Song, Cryogenic}} for grinding.}}');
  assert.deepEqual(paired[0].enchants, ['Blessed Song', 'Cryogenic']);
  assert.equal(paired[0].text, 'Blessed Song, Cryogenic for grinding.');
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

test('rod abilities preserve nested mechanics, mutation chances, conditions, quantities, and mastery bonuses', async () => {
  const mod = await fresh();
  const features = mod.extractRodFeatures(`
== Ability ==
{{Ability
|mutation1='''8%''' chance for {{Mutation|Sunken|val=1}}
|conditional1=Perfect Catches have a '''100%''' chance for {{Mutation|Verdant}}.
|conditionalnote1=Requires a fresh catch; appraisal does not count.
|mechanic1=Random stats every catch:
|mechanic1.2=Control from '''-0.3''' to '''0.3'''.
|mechanic1.1=Resilience from '''-80%''' to '''80%'''.
|unique1=Every '''10''' catches, '''25%''' chance for {{Item|Treasure Map|ni=1}}.
}}
== Mastery ==
{{Rod Mastery
|level=1
|name1=Sunken Perfection
|desc1=Catch {{Fish|Cod|x=20|attrs={{Mutation|Sunken}}}} using {{Rod|Sunken Rod}}.
|reward1='''+35% Lure Speed''' and '''+5% Sunken Rate''' Enhancement.
|note1=Only after completing this task.
|reward_grand={{Item|Golden Sunken Rod|type=Skin}} Skin
}}
== Enchanting ==
This separate section must not appear as an ability.`);
  assert.equal(features.abilities.length, 4);
  assert.equal(features.abilities[0].text, '8% chance for Sunken');
  assert.equal(features.abilities[1].note, 'Requires a fresh catch; appraisal does not count.');
  assert.deepEqual(features.abilities[2].details, ['Resilience from -80% to 80%.', 'Control from -0.3 to 0.3.']);
  assert.match(features.abilities[3].text, /10 catches, 25% chance/);
  assert.equal(features.masteryLevel, '1');
  assert.equal(features.mastery[0].objective, 'Catch 20 × Sunken Cod using Sunken Rod.');
  assert.equal(features.mastery[0].reward, '+35% Lure Speed and +5% Sunken Rate Enhancement.');
  assert.equal(features.mastery[0].note, 'Only after completing this task.');
  assert.equal(features.mastery[1].reward, 'Golden Sunken Rod Skin');
  assert.deepEqual(mod.extractRodFeatures('No ability listed. <!-- == Mastery ==\n{{Rod Mastery|reward1=Retired bonus}} -->'), { abilities: [], mastery: [], masteryLevel: '' });
  assert.ok(mod.rodFallback.rods.every(rod => Array.isArray(rod.abilities) && Array.isArray(rod.mastery)));
  const sunken = mod.rodFallback.rods.find(rod => rod.page === 'Sunken Rod');
  assert.ok(sunken.abilities.some(ability => /Treasure Map/.test(ability.text)));
  assert.ok(sunken.mastery.some(task => /\+5% Sunken Rate/.test(task.reward)));
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
          ...(content ? { slots: { main: { content: '{{Enchanting|optimal1={{Enchantment|Hasty}} for speed.}}\n== Ability ==\n{{Ability|mutation1=8% chance for {{Mutation|Sunken}}}}\n== Mastery ==\n{{Rod Mastery|desc1=Catch 20 fish.|reward1=+5% mutation chance.}}' } } } : {}),
        }],
      })) } }) };
    };
    const [first, concurrent] = await Promise.all([mod.getRodDataset(), mod.getRodDataset({ forceRefresh: true })]);
    assert.equal(first, concurrent); assert.equal(first.mode, 'api'); assert.equal(first.rods.length, 265);
    assert.equal(first.rods.find(r => r.id === 999999).stage, 'Stage 12');
    assert.deepEqual(first.rods.find(r => r.id === 999999).recommendations[0].enchants, ['Hasty']);
    assert.equal(first.rods.find(r => r.id === 999999).abilities[0].text, '8% chance for Sunken');
    assert.equal(first.rods.find(r => r.id === 999999).mastery[0].reward, '+5% mutation chance.');
    // One-time migration imports obtainment text; subsequent checks remain incremental.
    const migratedContentRequests = Math.ceil(raw.length / 50);
    assert.equal(contentRequests, migratedContentRequests); const initialRequests = requests;
    clock += 10000; await mod.getRodDataset({ forceRefresh: true }); assert.equal(requests, initialRequests);
    clock += 61000; const refreshed = await mod.getRodDataset({ forceRefresh: true });
    assert.equal(contentRequests, migratedContentRequests); assert.notEqual(refreshed.fetchedAt, first.fetchedAt);
    clock += 61000; globalThis.fetch = async () => ({ ok: true, json: async () => ({ bucket: raw.slice(0,2) }) });
    const failed = await mod.getRodDataset({ forceRefresh: true });
    assert.equal(failed.mode, 'snapshot'); assert.equal(failed.fetchedAt, refreshed.fetchedAt);
    assert.deepEqual(failed.rods, refreshed.rods);
    const freshMod = await fresh(); globalThis.fetch = async () => { throw new Error('Source unavailable'); };
    const fallback = await freshMod.getRodDataset(); assert.equal(fallback.fetchedAt, snapshot.fetchedAt);
    assert.equal(fallback.rods.length, 264);
  } finally { globalThis.fetch = realFetch; globalThis.Date = RealDate; }
});
