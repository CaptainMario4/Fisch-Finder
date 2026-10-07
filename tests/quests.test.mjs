import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const compile=path=>ts.transpileModule(fs.readFileSync(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const uri=code=>'data:text/javascript;base64,'+Buffer.from(code).toString('base64');
const wikiCode=compile('../src/lib/quest-wiki.ts'),wiki=await import(uri(wikiCode));
const snapshot=JSON.parse(fs.readFileSync(new URL('../src/data/quests-snapshot.json',import.meta.url),'utf8'));
const compiled=compile('../src/lib/quests.ts').replace("import snapshot from '../data/quests-snapshot.json';",`const snapshot=${JSON.stringify(snapshot)};`).replace("from './quest-wiki'",`from '${uri(wikiCode)}'`);
let id=0;const fresh=()=>import(uri(compiled+`\n// ${id++}`));const search=await import(uri(compile('../src/lib/quest-search.ts')));

test('quest parser preserves quantities, mutations, alternatives, variable targets, coordinates and solution table rowspans',async()=>{
 const mod=await fresh();const parsed=mod.extractQuestDetails(`{{NPCInfoBox|gps={{Coordinates|-100|50|300}}}}
A fisher with a quest.
== Quests ==
Requires Level 500 and a [[Prior Quest]].
{{Quest|name=First Trial|step1=Catch the targets|tasks1=Catch {{Fish|Handfish|2|attrs=Shiny,Sparkling}} with {{Rod|Aurora Rod}}\nCatch 1 {{Fish|Moby}} or {{Fish|Humpback Whale}}\nCatch 1 <Mutation> <CurrentFish>|step2=Return to the NPC}}
=== Solutions ===
{| class="wikitable"
|+ Answers
! Quest !! Riddle !! Answer
|-
| rowspan="2" | First Trial
| Riddle 1 || {{Fish|Isonade|attrs=Aurora}}
|-
| Riddle 2 || [[Skycrest]] ({{Coordinates|-12|3|40}})
|}
== Dialogue ==
:'''NPC''': Secret dialogue should not appear.
;(Rewards {{Rod|Reward Rod}})
== Navigation ==
{{NPC Navbox}}`);
 assert.equal(parsed.gps,'-100, 50, 300');assert.equal(parsed.stages[0].steps[0].tasks[0].text,'Catch 2 × Shiny + Sparkling Handfish with Aurora Rod');
 assert.equal(parsed.stages[0].steps[0].tasks[0].fish[0].quantity,'2');assert.equal(parsed.stages[0].steps[0].tasks[0].rods[0].name,'Aurora Rod');
 assert.match(parsed.stages[0].steps[0].tasks[1].text,/Moby or Humpback Whale/);assert.match(parsed.stages[0].steps[0].tasks[2].text,/\[Mutation\] \[CurrentFish\]/);
 assert.ok(parsed.incomplete);assert.ok(!JSON.stringify(parsed.notes).includes('Secret dialogue'));assert.deepEqual(parsed.rewards,['Reward Rod']);
 assert.equal(parsed.notes[1].tables[0].rows[1][0],'First Trial');assert.equal(parsed.notes[1].tables[0].rows[1][2],'Skycrest (-12, 3, 40)');
 const fallback=mod.questFallback;assert.ok(fallback.quests.length>300);assert.ok(fallback.quests.filter(q=>q.status==='available').length>150);
 const fabulous=fallback.quests.find(q=>q.npc==='Fabulous Deity');assert.match(fabulous.stages[0].steps[0].tasks[0].text,/2 × Shiny \+ Sparkling Handfish/);
 const crook=fallback.quests.find(q=>q.npc==='Dr. Crookspine');assert.ok(crook.stages.find(s=>s.name==='Time Machine').archived);
 const lyren=fallback.quests.find(q=>q.npc==='Lyren');assert.equal(lyren.notes.find(n=>n.heading==='Quests Solution').tables.length,3);assert.ok(lyren.stages[0].steps[0].tasks.every(t=>t.rods.length===1));
 assert.ok(fallback.mutations.find(m=>m.name==='Wrath').rods.some(r=>r.name==='Rod Of The Zenith'));
 assert.ok(!fallback.quests.some(q=>JSON.stringify(q.notes).includes('Dialogue Start')));
});

test('search combines objectives and location filters, capacity suggestions exclude unavailable rods, and progress is safe and stable',async()=>{
 const {questFallback:data}=await fresh();const defaults=search.questFilterDefaults;
 const results=search.findQuests(data.quests,'sunken',{...defaults},'name-asc');assert.ok(results.some(q=>q.npc==='Fabulous Deity'));assert.ok(results.every(q=>q.status==='available'));
 assert.ok(search.findQuests(data.quests,'Aurora Rod',{...defaults,location:'Boreal Hollow'},'name-asc').some(q=>q.npc==='Lyren'));
 assert.ok(search.findQuests(data.quests,'',{...defaults,status:'unavailable'},'name-asc').every(q=>q.status==='unavailable'));
 assert.ok(search.questOptions(data.quests).location.includes('Skycrest'));
 const synthetic={...data,rods:[{page:'Small',name:'Small',maximumWeight:100,unavailable:false},{page:'Fit',name:'Fit',maximumWeight:1000,unavailable:false},{page:'Removed',name:'Removed',maximumWeight:9000,unavailable:true}]};assert.deepEqual(search.capacityRods(synthetic,{maximumWeight:500}).map(r=>r.name),['Fit']);assert.deepEqual(search.capacityRods(synthetic,{maximumWeight:null}),[]);
 assert.deepEqual(search.readQuestProgress('{"12:abc":true,"13:def":false,"invalid":true,"__proto__":true}'),{'12:abc':true});assert.deepEqual(search.readQuestProgress('bad json'),{});
 const q=data.quests.find(q=>q.npc==='Dr. Crookspine');assert.ok(!search.questTasks(q).some(t=>t.text.includes('50 Sundial')));const task=search.questTasks(q)[0];assert.equal(search.taskProgressKey(q,task),search.taskProgressKey({...q,name:'Renamed'},task));
});

test('quest refresh coalesces calls, caches success, discovers additions and retains complete guides and timestamps after failures',async()=>{
 const mod=await fresh(),originalFetch=globalThis.fetch,originalNow=Date.now;let now=Date.parse('2026-10-07T22:00:00Z'),calls=0,fail=false;const old=mod.questFallback.quests;
 const raw=old.map(q=>({page_id:q.id,page_name:q.page,name:q.npc,location:q.locations,event:q.events,is_removed:q.status==='unavailable',is_quest:true}));
 raw.push({page_id:999999,page_name:'New NPC',name:'New NPC',location:['New Region'],is_removed:false,is_quest:true});
 Date.now=()=>now;
 globalThis.fetch=async url=>{calls++;if(fail)throw new Error('offline');const p=new URL(url).searchParams;let result;
  if(p.get('action')==='bucket'){const query=p.get('query');result={bucket:query.includes("'npcs'")?raw:query.includes("'fish'")?Array.from({length:1700},(_,i)=>({page_name:'Fish '+i,name:'Fish '+i,base_weight:100})):query.includes("'rods'")?Array.from({length:270},(_,i)=>({page_name:'Rod '+i,journal:'Rod '+i,max_weight:1000})): [{page_id:888888,page_name:'Unrelated mutation',name:'Unrelated mutation'}]};}
  else if(p.get('list')==='categorymembers')result={query:{categorymembers:[]}};
  else result={query:{pages:p.get('pageids').split('|').map(value=>{const key=Number(value);return {pageid:key,title:key===999999?'New NPC':old.find(q=>q.id===key)?.page,revisions:[{revid:key===999999?1:snapshot.revisions[key],...(p.get('rvslots')?{slots:{main:{content:'{{NPCInfobox|location=New Region}}\n== Quest ==\n{{Quest|name=New Quest|step1=Catch a fish|tasks1=Catch {{Fish|Fish 1}}}}'}}}:{})}]};})}};
  return {ok:true,json:async()=>result};
 };
 try{const [a,b]=await Promise.all([mod.getQuestDataset(),mod.getQuestDataset()]);assert.equal(a,b);assert.equal(a.mode,'api');assert.ok(a.quests.some(q=>q.name==='New Quest'));assert.ok(search.questOptions(a.quests).location.includes('New Region'));const count=calls;await mod.getQuestDataset();assert.equal(calls,count);await mod.getQuestDataset({forceRefresh:true});assert.equal(calls,count);now+=61000;fail=true;const stale=await mod.getQuestDataset({forceRefresh:true});assert.equal(stale.mode,'snapshot');assert.equal(stale.fetchedAt,a.fetchedAt);assert.equal(stale.quests.length,a.quests.length);assert.ok(stale.notice.includes('last successful'));}finally{globalThis.fetch=originalFetch;Date.now=originalNow;}
});
