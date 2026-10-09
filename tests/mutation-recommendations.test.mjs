import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const source=fs.readFileSync(new URL('../src/components/QuestHelper.tsx',import.meta.url),'utf8');
const helper=source.slice(source.indexOf('const preferredMutationRods'),source.indexOf('function RecommendationLabel'));
const code='const fold=s=>s.toLowerCase().replace(/[^a-z0-9]/g,"");const rodMatch=(d,p)=>d.rods.find(r=>fold(r.page)===fold(p));'+helper+'\nexport {automaticMutationRod};';
const {automaticMutationRod:pick}=await import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64'));
function data(notes,overrides={}) {
 const pages=['First Rod','Second Rod','Third Rod'];
 return {mutations:[{name:'New Mutation',page:'New Mutation',url:'https://fischipedia.org/wiki/New_Mutation',rods:pages.map(page=>({page,name:page})),notes}],rods:pages.map(page=>({page,unavailable:false,permanentRoute:true,...overrides[page]}))};
}
test('new primary-wiki methods automatically choose highest unconditional base rate',()=>{
 assert.equal(pick('New Mutation',data(['First Rod at a 20% chance.','Second Rod at a 40% chance. 80% when Mastery Enhancement is active.','Third Rod at a 10% chance.'])).page,'Second Rod');
});
test('limited, unavailable and unknown obtainment cannot win',()=>{
 const notes=['First Rod at a 100% chance.','Second Rod at a 40% chance.','Third Rod at a 10% chance.'];
 for(const flags of [{permanentRoute:false},{unavailable:true},{permanentRoute:undefined}])
 assert.equal(pick('New Mutation',data(notes,{'First Rod':flags})).page,'Second Rod');
});
test('event, duplicate, mastery-only and malformed rates are not ordinary base chances',()=>{
 for(const line of ['First Rod at a 100% chance during an event.','First Rod passive at a 100% chance.','First Rod at a 100% chance on duplicated fish.','First Rod increasing chance by 100% after mastery.','First Rod at a 200% chance.'])
 assert.equal(pick('New Mutation',data([line,'Second Rod at a 40% chance.','Third Rod at a 10% chance.'])).page,'Second Rod');
});
test('ties, foreign sources and short lists do not invent winners',()=>{
 const d=data(['First Rod at a 40% chance.','Second Rod at a 40% chance.']);
 assert.equal(pick('New Mutation',d),undefined);
 d.mutations[0].url='https://fisch.fandom.com/wiki/New_Mutation';assert.equal(pick('New Mutation',d),undefined);
 d.mutations[0].url='https://fischipedia.org/wiki/New_Mutation';d.mutations[0].rods.pop();assert.equal(pick('New Mutation',d),undefined);
});
test('refreshed chances change the winner without a curated code entry',()=>{
 const d=data(['First Rod at a 20% chance.','Second Rod at a 40% chance.']);
 assert.equal(pick('New Mutation',d).page,'Second Rod');
 d.mutations[0].notes=['First Rod at a 60% chance.','Second Rod at a 40% chance.'];
 assert.equal(pick('New Mutation',d).page,'First Rod');
});
