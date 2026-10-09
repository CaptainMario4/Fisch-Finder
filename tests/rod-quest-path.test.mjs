import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import React from 'react';
import {renderToString} from 'react-dom/server';
import {createServer} from 'vite';
const server=await createServer({configFile:false,server:{middlewareMode:true,hmr:false},esbuild:{jsx:'automatic'}});
after(()=>server.close());
const model=await server.ssrLoadModule('/src/lib/rod-quest-path.ts');
const {rodFallback}=await server.ssrLoadModule('/src/lib/rods.ts');
const {default:Tree}=await server.ssrLoadModule('/src/components/RodQuestTree.tsx');
const data=JSON.parse(fs.readFileSync(new URL('../src/data/quests-snapshot.json',import.meta.url),'utf8')).data;
const target=page=>rodFallback.rods.find(r=>r.page===page||r.name===page);
const task=(overrides={})=>({id:'task',text:'Catch a fish',fish:[],rods:[],mutations:[],...overrides});

test('real multi-stage Shadow guide exposes each stage and keeps explicit rod alternatives',()=>{
 const rod=target('Noiseform');assert.ok(rod);
 const [path]=model.rodQuestPaths(rod,rodFallback.rods,data);
 assert.equal(path.quest.page,'Mysterious Shadow');assert.equal(path.stages.length,3);
 const methods=path.stages.flatMap(s=>s.objectives.flatMap(o=>o.methods));
 for(const name of ['Blossomed','Sunken','Soultouched','Jackpot','Requies'])assert.ok(methods.some(m=>m.name===name),name);
 const explicit=path.stages.flatMap(s=>s.objectives.flatMap(o=>o.rods));
 assert.deepEqual(explicit.map(r=>[r.name,r.role]),[['Duskwire','accepted'],['Tranquility Rod','accepted']]);
});
test('selected-rod follow-up tasks are excluded and duplicate source stage entries stay grouped',()=>{
 const rod=target("Pinion's Aria");const [path]=model.rodQuestPaths(rod,rodFallback.rods,data);
 assert.equal(path.stages.length,2);assert.ok(path.omittedSelfTasks);
 assert.ok(path.stages.some(s=>s.variants));
 const objectives=path.stages.flatMap(s=>s.objectives);
 assert.ok(objectives.some(o=>o.methods.some(m=>m.name==='Heavenly'&&m.rods.some(r=>r.page==="Heaven's Rod"))));
 assert.ok(objectives.every(o=>!o.task.rods.some(ref=>ref.page===rod.page)));
});
test('required rods take priority over incompatible mutation suggestions and preserve conditions',()=>{
 const rod=target("Pinion's Aria");
 const result=model.pathObjective(task({text:'Catch a Giant fish using Steady Rod with Wobbly enchantment',rods:[{page:'Steady Rod',name:'Steady Rod'}],mutations:['Giant','Heavenly']}),data,rod);
 assert.equal(result.rods[0].role,'required');
 assert.ok(result.methods.every(m=>m.rods.length===0));assert.match(result.task.text,/Wobbly/);
 const size=model.pathObjective(task({mutations:['Giant']}),data,rod);
 assert.equal(size.methods[0].rods[0].page,'Evil Pitchfork');assert.equal(size.methods[0].rods[0].role,'suggested');
 const putrid=model.pathObjective(task({mutations:['Putrid']}),data,rod);
 assert.match(putrid.methods[0].note,/Putrid enchantment.*2%/);
});
test('permanent mutation options precede limited methods and selected rod cannot recommend itself',()=>{
 const rod=target("Pinion's Aria");
 const fixture={...data,mutations:[{page:'New',name:'New',url:'https://fischipedia.org/wiki/New',notes:['Limited Rod at a 100% chance.','Permanent Rod at a 30% chance.'],rods:[{page:'Limited Rod',name:'Limited Rod'},{page:'Permanent Rod',name:'Permanent Rod'},{page:rod.page,name:rod.name}]}],rods:[{page:'Limited Rod',name:'Limited Rod',unavailable:true,permanentRoute:false},{page:'Permanent Rod',name:'Permanent Rod',unavailable:false,permanentRoute:true},{page:rod.page,name:rod.name,unavailable:false,permanentRoute:true}]};
 const result=model.pathObjective(task({mutations:['New']}),fixture,rod);
 assert.equal(result.methods[0].rods[0].page,'Permanent Rod');assert.ok(result.methods[0].rods[0].recommended);
 assert.ok(result.methods[0].rods.every(r=>r.page!==rod.page));
});
test('ambiguous quest aliases and incidental wiki links do not become invented prerequisites',()=>{
 const ref={page:'Shared Alias',name:'Shared Alias',kind:'quest',quantity:'',attributes:''};
 assert.equal(model.matchPathQuest(ref,{...data,quests:[{page:'One',name:'One',npc:'Shared Alias'},{page:'Two',name:'Two',npc:'Shared Alias'}]}),undefined);
 const other=target('Steady Rod'),rod={...target("Pinion's Aria"),obtainment:{version:2,references:[{kind:'wiki',page:'XP',name:'XP',quantity:'',attributes:''},{kind:'rod',page:other.page,name:other.name,quantity:'',attributes:''}],sections:[{heading:'Obtainment',steps:[{text:'An example is Steady Rod.',references:[{page:other.page}]}]}]}};
 assert.equal(model.pathReferencedRods(rod,[rod,other]).length,0);
 rod.obtainment.sections[0].steps[0].text='Requires Steady Rod with a specific enchantment.';
 assert.equal(model.pathReferencedRods(rod,[rod,other]).length,1);
});
test('rendered tree starts with desired rod, omits wiki cards and keeps branches lazy',()=>{
 const rod=target('Noiseform');
 const html=renderToString(React.createElement(Tree,{rod,rods:rodFallback.rods,data,request(){},loading:false,error:''})).replace(/<!--[\s\S]*?-->/g,'');
 assert.ok(html.indexOf('Desired rod')<html.indexOf('Mysterious Shadow'));
 assert.match(html,/Open Quest Helper/);assert.match(html,/Show Sunken Rod prerequisites/);
 assert.match(html,/Duskwire/);assert.match(html,/Tranquility Rod/);
 assert.ok(!html.includes('Wiki reference'));assert.ok(!html.includes('Rod Journal'));assert.ok(!html.includes('>XP<'));
 assert.ok(!html.includes('Quest and rod prerequisites for Sunken Rod'),'collapsed rod subtrees do not render');
 assert.ok(html.length<100000,'avoid expanding the entire recursive graph at once');
});
