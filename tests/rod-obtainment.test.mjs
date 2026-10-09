import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { createServer } from 'vite';
const compile=path=>ts.transpileModule(fs.readFileSync(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const uri=code=>'data:text/javascript;base64,'+Buffer.from(code).toString('base64');
const mod=await import(uri(compile('../src/lib/rod-obtainment.ts').replace("from './quest-wiki'","from '"+uri(compile('../src/lib/quest-wiki.ts'))+"'")));
const base={id:1,page:'Target Rod',name:'Target Rod',url:'https://fischipedia.org/wiki/Target_Rod',level:'100',price:'C$ 50,000',quest:'',event:'',region:'Ancient Archives',source:'Crafting',unavailable:false};
test('obtainment parser retains quantities, attributes, unlocks and alternate source sections',()=>{
 const result=mod.extractRodObtainment(`
== Obtainment ==
Requires completing {{Quest|Unlock Quest}}.
=== Crafting ===
Craft at [[Ancient Archives]] after reaching Level 100.
* {{Fish|Driftwood|x=2|attrs=Mythical}}
* {{Item|Magic Thread|1}}
* Use {{Rod|Starter Rod}} or trade for the materials.
=== Purchasing ===
Alternatively purchase during [[Special Event]].
== Mastery ==
* {{Item|Do Not Include|99}}
<!-- {{Item|Retired Ingredient|3}} -->
`);
 assert.deepEqual(result.sections.map(s=>s.heading),['Obtainment','Crafting','Purchasing']);
 assert.match(result.sections[1].steps[1].text,/2 × Mythical Driftwood/);
 assert.match(result.sections[1].steps[3].text,/or trade/);
 assert.ok(result.references.some(r=>r.kind==='quest'&&r.page==='Unlock Quest'));
 assert.ok(result.references.some(r=>r.page==='Driftwood'&&r.quantity==='2'&&r.attributes==='Mythical'));
 assert.ok(!JSON.stringify(result).match(/Do Not Include|Retired Ingredient|\{\{|\[\[/));
});
test('table rows stay in their source section and do not lose quantities',()=>{
 const result=mod.extractRodObtainment(`== Obtainment ==
=== Crafting ===
{| class="wikitable"
! Ingredient !! Quantity
|-
| {{Item|Ruby}} || 2
|-
| {{Fish|Driftwood|x=3|attrs=Frozen}} || 3
|}
=== Purchase ===
Pay C$ 100.
== Abilities ==
Ignored.`);
 assert.deepEqual(result.sections.map(s=>s.heading),['Crafting','Purchase']);
 assert.match(result.sections[0].steps[1].text,/3 × Frozen Driftwood/);
 assert.equal(result.references.find(r=>r.page==='Driftwood').quantity,'3');
 assert.equal(result.references.find(r=>r.page==='Ruby').quantity,'2');
});
test('Recipe template ingredient parameters with spaces preserve count, mutation notes and zero cost',()=>{
 const result=mod.extractRodObtainment('== Obtainment ==\n{{Recipe|level=50|sort=Ruby;Driftwood;Magic Thread|Ruby=1|Driftwood=2/Mythical|Magic Thread=1|price=0}}');
 assert.equal(result.version,3);assert.equal(result.level,'50');assert.equal(result.price,'C$ 0');
 assert.deepEqual(result.references.map(r=>[r.page,r.quantity,r.attributes]),[['Ruby','1',''],['Driftwood','2','Mythical'],['Magic Thread','1','']]);
 assert.match(result.sections[0].steps[0].text,/Driftwood ×2 \(Mythical\)/);
 assert.ok(!JSON.stringify(result).includes('Magic Thread ='));
});
test('quest aliases preserve wiki targets and remove hidden classification text',()=>{
 assert.deepEqual(mod.rodQuestReferences('[[Easter Bunny (NPC)|Easter Bunny]]<span style="display:none;">Quest</span>').map(r=>[r.page,r.name]),[['Easter Bunny (NPC)','Easter Bunny']]);
 const refs=mod.rodQuestReferences('[[First Quest]] & [[Second Quest]]');
 assert.equal(refs.length,2);
 const url=new URL(mod.obtainQuestUrl(refs[0]),'https://example.com');
 assert.equal(url.searchParams.get('quest'),'First Quest');assert.equal(url.searchParams.get('status'),'all');
 assert.ok(!mod.obtainmentReferences('[[javascript:alert(1)]] [[File:Icon.png]] {{Item|https://bad.test}}').length);
});
test('requirements expose metadata and prerequisite rods without conflating mutation variants',()=>{
 const root={...base,name:'Target Display Name',questReferences:mod.rodQuestReferences('[[Unlock Quest]]'),obtainment:mod.extractRodObtainment('== Obtainment ==\n* {{Fish|Driftwood|2|attrs=Frozen}}\n* {{Fish|Driftwood|2|attrs=Mythical}}\n* {{Rod|Starter Rod}}\n* {{Rod|Target Rod}}\n* [[Old Target Page|Target Display Name]]')};
 const nodes=mod.rodObtainmentNodes(root,[root,{...base,page:'Starter Rod',name:'Starter Rod'}]);
 assert.ok(nodes.some(n=>n.kind==='level'));assert.ok(nodes.some(n=>n.kind==='price'));assert.ok(nodes.some(n=>n.kind==='quest'));
 assert.equal(nodes.filter(n=>n.kind==='fish').length,2);
 assert.equal(nodes.filter(n=>n.kind==='rod').length,1);
 assert.ok(nodes.every(n=>n.title!=='Target Rod'));
 assert.ok(nodes.every(n=>n.title!=='Target Display Name'),'a wiki alias for the selected rod must not become its own prerequisite');
});
test('viewer guards cycles, preserves unknown and unavailable warnings, and renders semantic links',async()=>{
 const server=await createServer({configFile:false,server:{middlewareMode:true,hmr:false},esbuild:{jsx:'automatic'}});
 try{
  const {default:Viewer}=await server.ssrLoadModule('/src/components/RodObtainmentViewer.tsx');
  const a={...base,questReferences:mod.rodQuestReferences('[[Unlock Quest]]'),obtainment:mod.extractRodObtainment('== Obtainment ==\nUse {{Rod|Other Rod}}.')};
  const b={...base,page:'Other Rod',name:'Other Rod',unavailable:true,obtainment:mod.extractRodObtainment('== Obtainment ==\nUse {{Rod|Target Rod}}.')};
  const html=renderToString(React.createElement(Viewer,{rod:a,rods:[a,b],select(){},loading:false}));
  assert.match(html.replace(/<!--[\s\S]*?-->/g,''),/Show Other Rod prerequisites/);assert.match(html,/Limited or marked unavailable/);
  assert.ok(!html.includes('Referenced requirements for Other Rod'),'collapsed branches render lazily');
  assert.match(html,/Open Quest Helper/);assert.match(html,/quest=Unlock\+Quest/);
  assert.ok(html.length<30000,'cyclic dependencies must terminate');
  const empty=renderToString(React.createElement(Viewer,{rods:[a],select(){},loading:false}));
  assert.match(empty,/Select your next rod/);
 }finally{await server.close();}
});
