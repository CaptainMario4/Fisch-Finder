import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToString} from 'react-dom/server';
import {createServer} from 'vite';
const server=await createServer({configFile:false,server:{middlewareMode:true,hmr:false},esbuild:{jsx:'automatic'}});
after(()=>server.close());
const model=await server.ssrLoadModule('/src/lib/rod-purchase.ts');
const {withPurchaseAreas}=await server.ssrLoadModule('/src/lib/rod-access-cache.ts');
const {rodFallback}=await server.ssrLoadModule('/src/lib/rods.ts');
const {default:Tree}=await server.ssrLoadModule('/src/components/RodQuestTree.tsx');
const {extractRodObtainment}=await server.ssrLoadModule('/src/lib/rod-obtainment.ts');
const target=name=>rodFallback.rods.find(r=>r.page===name);
const render=rod=>renderToString(React.createElement(Tree,{rod,rods:rodFallback.rods,request(){},loading:false,error:''})).replace(/<!--[\s\S]*?-->/g,'');

test('Decayed purchase tree separates rod cost from mask access cost and current bestiary prerequisite',()=>{
 const rod=target('Decayed Rod');const path=model.purchasePath(rod);
 assert.equal(path.location,'Toxic Grove');assert.equal(path.price,'C$ 2,000');
 assert.equal(rod.purchaseAccess.area.page,'Lost Jungle');
 const text=JSON.stringify(rod.purchaseAccess);
 assert.match(text,/Gas Mask/);assert.match(text,/C\$ 75,000/);assert.match(text,/50%/);
 assert.ok(!text.includes('Gather all 5 workers'),'retired countdown quest is not an entrance requirement');
 const html=render(rod);
 assert.ok(html.indexOf('Desired rod')<html.indexOf('Purchase location'));
 assert.ok(html.indexOf('Purchase location')<html.indexOf('Area access &amp; preparation'));
 assert.ok(html.indexOf('Area access &amp; preparation')<html.indexOf('Access equipment'));
 assert.match(html,/Lost_Jungle#Toxic_Grove/);assert.match(html,/Gas_Mask/);
});
test('purchase locations, NPC instructions, coordinates, availability and alternative buying routes stay visible',()=>{
 const rod={...target('Steady Rod'),obtainment:extractRodObtainment('== Obtainment ==\nPurchase from [[Shopkeeper]] in [[Roslit Bay]] for {{C$|7,000}} at {{Coordinates|1|2|3}}.'),unavailable:true};
 const html=render(rod);assert.match(html,/Shopkeeper/);assert.match(html,/1, 2, 3/);assert.match(html,/purchase route may be historical/);
 const craft={...rod,source:'Crafting',hint:'Craft it.',obtainment:extractRodObtainment('== Obtainment ==\n=== Crafting ===\nUse a crafting station.\n=== Purchasing ===\nAlternatively buy from [[Shopkeeper]].')};
 assert.ok(model.purchasePath(craft).alternative);assert.match(render(craft),/Purchase option/);
 assert.equal(model.purchasePath({...rod,source:'Quest',hint:'Complete a quest.',obtainment:undefined}),undefined);
});
test('area parser scopes redirected siblings, drops history and fishing conditions, and retains complete access lists',()=>{
 const raw=`== Cave ==\n<h3>Target Area</h3>\nYou must equip {{Item|Test Mask}} to enter.\n\nThe door requires these items:\n* {{Item|First Key}}\n* {{Item|Second Key}}\n\nFishing in the cave requires 150 durability.\n<h3>Neighbor Area</h3>\nRequires {{Item|Wrong Key}}.\n<!-- Requires {{Quest|Retired Quest}}. -->`;
 const guide=model.extractAreaAccess('Target Area','Island',7,raw,'2026-10-09T00:00:00Z');
 const text=JSON.stringify(guide);assert.match(text,/First Key/);assert.match(text,/Second Key/);assert.match(text,/Test Mask/);
 assert.ok(!text.match(/Wrong Key|Retired Quest|150 durability/));
 const missing=model.extractAreaAccess('Unknown Area','Island',7,raw,'date');assert.equal(missing.steps.length,0);
 const alternatives=model.extractAreaAccess('Garden','Garden',1,'To travel you must use {{Boat|Required Raft}}. The {{Item|Unneeded Mask}} is not required here.','date');
 assert.deepEqual(alternatives.equipment,['Required Raft']);
});
test('root access headings are read without using fishing subsections with the same name',()=>{
 const raw='An island.\n== Entering Test Area ==\nThe gate requires a {{Item|Gate Key}}.\n* The door stays open permanently.\n== Fishing Locations ==\n=== Test Area ===\nRare fish require bait.';
 const guide=model.extractAreaAccess('Test Area','Test Area',1,raw,'date');
 assert.match(JSON.stringify(guide),/Gate Key/);assert.ok(!JSON.stringify(guide).includes('Rare fish'));
});
test('undocumented and secondary routes remain honest and keep the original source',()=>{
 const rod={...target('Steady Rod'),region:'New Unknown Area',purchaseAccess:undefined};
 assert.match(render(rod),/Access requirements not documented/);
 const secondary={...rod,url:'https://fisch.fandom.com/wiki/Test_Rod',secondary:{source:'fandom'}};
 assert.equal(model.attachPurchaseAccess(secondary,{'new unknown area':{steps:[]}}),secondary);
 assert.match(render(secondary),/Fisch Fandom purchase instructions/);
});
test('unique areas and equipment are batch cached; changed sources replace old conditions and failures retain the last guide',async()=>{
 const rod={...target('Steady Rod'),page:'Cache Rod',region:'Cache Cave',purchaseAccess:undefined};
 let revision=1001,fail=false,calls=[];
 const request=async params=>{
  calls.push(params);if(fail)throw new Error('Wiki offline');
  const content=params.rvprop.includes('content');
  if(params.titles){const equipment=params.titles==='Cache Mask';return {query:{redirects:equipment?[]:[{from:'Cache Cave',to:'Cache Island'}],pages:[{pageid:equipment?2:1,title:equipment?'Cache Mask':'Cache Island',revisions:[{revid:equipment?1:revision}]}]}};}
  return {query:{pages:params.pageids.split('|').map(id=>({pageid:Number(id),title:id==='2'?'Cache Mask':'Cache Island',revisions:[{revid:id==='2'?1:revision,slots:{main:{content:id==='2'?'== Obtainment ==\nThe mask is purchasable for {{C$|100}}.':`== Cache Cave ==\nYou must equip {{Item|Cache Mask}} to enter.\n\nRequires ${revision===1001?'one':'two'} keys.\n== Other Area ==\nRequires another quest.`}}}]}))}};
 };
 const first=await withPurchaseAreas([rod,rod],request);assert.equal(calls.filter(c=>c.titles==='Cache Cave').length,1);
 assert.equal(first[0].purchaseAccess.equipment[0].region,'Cache Mask');assert.match(JSON.stringify(first),/one keys/);
 calls=[];await withPurchaseAreas([rod],request);assert.ok(calls.every(c=>!c.rvprop.includes('content')));
 revision++;const changed=await withPurchaseAreas([rod],request);assert.match(JSON.stringify(changed),/two keys/);assert.ok(!JSON.stringify(changed).includes('one keys'));
 fail=true;const offline=await withPurchaseAreas([rod],request);assert.deepEqual(offline[0].purchaseAccess,changed[0].purchaseAccess);
});
