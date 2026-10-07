import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const snapshot = JSON.parse(fs.readFileSync(new URL('../src/data/companions-snapshot.json', import.meta.url), 'utf8'));
const compile = path => ts.transpileModule(fs.readFileSync(new URL(path, import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const compiled = compile('../src/lib/companions.ts').replace("import snapshot from '../data/companions-snapshot.json';", `const snapshot = ${JSON.stringify(snapshot)};`);
let moduleId = 0;
const fresh = () => import('data:text/javascript;base64,' + Buffer.from(compiled + `\n// test ${moduleId++}`).toString('base64'));
const search = await import('data:text/javascript;base64,' + Buffer.from(compile('../src/lib/companion-search.ts')).toString('base64'));

test('companion abilities preserve nested templates, level scaling, conditions, references, and formulas', async () => {
  const mod = await fresh();
  const parsed = mod.extractCompanionDetails(`{{CompanionInfobox|name=Test}}
== Overview ==
{{Description|A [[Companion]] with {{TextStyle|many bonuses|#fff}}.}}
== Ability ==
{{Ability
|mechanic1=Every '''30''' seconds ('''15''' at max level)
|mechanic1.1=Grants '''+10%''' [[Luck]] {{Ref|Only during {{Weather|Rain}}.|note=1}}
|mechanicnote1=Requires {{Bait|Fish Head}}.
|unique1=Uses {{F|[20+(Boosted Value)]/[100+(Boosted Value)]}}.
|notes=One buff at a time. {{Reflist}}
}}
== Obtainment ==
Complete the [[Gardener|Gardener's]] quest.
* Feed {{Item|Stardust Candy|ni=1}}.
=== Dialogue ===
This dialogue should not become requirements.
== Gallery ==
[[File:Example.png]]`);
  assert.equal(parsed.description, 'A Companion with many bonuses.');
  assert.match(parsed.abilities[0].text, /30 seconds \(15 at max level\)/);
  assert.equal(parsed.abilities[0].details[0], 'Grants +10% Luck (Note: Only during Rain.)');
  assert.equal(parsed.abilities[0].notes[0], 'Requires Fish Head.');
  assert.match(parsed.abilities[1].text, /\[20\+\(Boosted Value\)\]\/\[100\+\(Boosted Value\)\]/);
  assert.equal(parsed.notes, 'One buff at a time.');
  assert.deepEqual(parsed.obtainment, ["Complete the Gardener's quest.", 'Feed Stardust Candy.']);
  assert.ok(!JSON.stringify(parsed).includes('dialogue'));
  assert.deepEqual(mod.extractCompanionDetails('No information').abilities, []);
  const fallback = mod.companionFallback.companions;
  assert.equal(fallback.length, 21);
  assert.ok(fallback.every(c => c.abilities.length > 0 && c.obtainment.length > 0));
  assert.ok(fallback.every(c => !JSON.stringify(c).match(/\{\{|\[\[|<span|&times;/)));
  const buffFixture = mod.extractCompanionDetails(`== Overview ==
{{Description|Relic buffs.}}
=== Buffs ===
{| class="wikitable"
! Relic !! Category !! Effect !! Level !! Type
|-
| {{Fish|Sovereign Relic}} || Normal || '''+10%''' [[XP]]<br>'''+1%''' {{Mutation|Shiny}} || 10+ || Primary
|-
|}
== Ability ==
{{Ability|unique1=Feed relics.}}
== Obtainment ==
Feed a relic.`);
  assert.deepEqual(buffFixture.buffs, [{ food: 'Sovereign Relic', category: 'Normal', effect: '+10% XP +1% Shiny', level: '10+', type: 'Primary' }]);
  assert.equal(fallback.find(c => c.name === 'Relic Construct').buffs.length, 7);
  assert.match(fallback.find(c => c.name === 'Relic Construct').buffs[4].effect, /10% chance for Sovereign/);
  assert.equal(fallback.find(c => c.name === 'Him').unavailable, true);
  assert.equal(fallback.find(c => c.name === 'Nico').page, 'Nico (Companion)');
});

test('search matches names, food, effects and new locations; filters combine and missing fields stay usable', async () => {
  const mod = await fresh();
  const companions = mod.companionFallback.companions;
  const empty = { ...search.companionFilterDefaults };
  assert.equal(search.findCompanions(companions, 'NÍCO', empty, 'name-asc').find(c => c.name === 'Nico').region, 'Underground Music Venue');
  assert.equal(search.findCompanions(companions, 'stardust candy', empty, 'name-asc')[0].name, 'Comet');
  assert.ok(search.findCompanions(companions, 'Sovereign', empty, 'name-asc').some(c => c.name === 'Relic Construct'));
  assert.deepEqual(search.findCompanions(companions, '', { ...empty, source: 'Code', status: 'unavailable' }, 'name-asc').map(c => c.name), ['Him']);
  assert.equal(search.findCompanions(companions, '', { ...empty, status: 'unavailable' }, 'name-asc').length, 2);
  assert.equal(search.findCompanions(companions, '', { ...empty, event: '__none__' }, 'name-asc').length, 17);
  assert.ok(search.findCompanions(companions, '', { ...empty, ability: 'Mutations' }, 'name-asc').every(c => c.abilities.some(a => a.group === 'Mutations')));
  const extra = mod.normalizeCompanions([{ page_id: 999, page_name: 'New Pal', location: 'New Island', food: 0 }], {});
  assert.equal(extra[0].food, '0'); assert.equal(extra[0].unavailable, false);
  assert.ok(search.companionFilterOptions([...companions, ...extra]).region.includes('New Island'));
  assert.equal(search.findCompanions(extra, '', { ...empty, ability: '__none__' }, 'name-desc')[0].name, 'New Pal');
  const sorted = search.findCompanions(companions, '', empty, 'name-desc');
  assert.equal(sorted[0].name, 'Tropical Toucan'); assert.equal(sorted.at(-1).name, 'Beak Bill');
});

test('refresh caches and coalesces source requests, adds new companions, fetches changed revisions, and keeps complete data on failure', async () => {
  const realFetch = globalThis.fetch, RealDate = globalThis.Date;
  let clock = RealDate.parse(snapshot.fetchedAt) + 3600000;
  globalThis.Date = class extends RealDate { constructor(...args) { super(...(args.length ? args : [clock])); } static now() { return clock; } };
  try {
    const mod = await fresh(); let requests = 0, contentRequests = 0, failContent = false, changed = false, incomplete = false;
    const raw = [...snapshot.companions, { page_id: 999999, page_name: 'New Test Pal', location: 'New Island', source: 'Quest' }];
    globalThis.fetch = async url => {
      requests++; const params = new URL(url).searchParams;
      if (params.get('action') === 'bucket') return { ok: true, json: async () => ({ bucket: incomplete ? raw.slice(0, 2) : raw }) };
      const content = params.get('rvprop').includes('content'); if (content) { contentRequests++; if (failContent) throw new Error('Partial source outage'); }
      return { ok: true, json: async () => ({ query: { pages: params.get('pageids').split('|').map(id => ({
        pageid: Number(id), revisions: [{ revid: id === '999999' ? (changed ? 43 : 42) : snapshot.sources[id].revision,
          ...(content ? { slots: { main: { content: `{{CompanionInfobox|name=New Test Pal}}\n== Ability ==\n{{Ability|mechanic1=${changed ? 'Updated' : 'New'} bonus at max level.}}\n== Obtainment ==\nComplete the new quest.` } } } : {}),
        }],
      })) } }) };
    };
    const [first, concurrent] = await Promise.all([mod.getCompanionDataset(), mod.getCompanionDataset({ forceRefresh: true })]);
    assert.equal(first, concurrent); assert.equal(first.mode, 'api'); assert.equal(first.companions.length, 22);
    assert.equal(first.companions.at(-1).name, 'Tropical Toucan');
    assert.equal(first.companions.find(c => c.id === 999999).abilities[0].text, 'New bonus at max level.');
    assert.equal(contentRequests, 1); const initialRequests = requests;
    clock += 10000; await mod.getCompanionDataset({ forceRefresh: true }); assert.equal(requests, initialRequests);
    clock += 61000; const checked = await mod.getCompanionDataset({ forceRefresh: true });
    assert.equal(contentRequests, 1); assert.notEqual(checked.fetchedAt, first.fetchedAt);
    clock += 61000; changed = true; const updated = await mod.getCompanionDataset({ forceRefresh: true });
    assert.equal(updated.companions.find(c => c.id === 999999).abilities[0].text, 'Updated bonus at max level.');
    clock += 61000; incomplete = true;
    const failed = await mod.getCompanionDataset({ forceRefresh: true });
    assert.equal(failed.mode, 'snapshot'); assert.equal(failed.fetchedAt, updated.fetchedAt);
    assert.deepEqual(failed.companions, updated.companions);
    const freshMod = await fresh(); incomplete = false; failContent = true;
    const fallback = await freshMod.getCompanionDataset();
    assert.equal(fallback.fetchedAt, snapshot.fetchedAt); assert.equal(fallback.companions.length, 21);
  } finally { globalThis.fetch = realFetch; globalThis.Date = RealDate; }
});
