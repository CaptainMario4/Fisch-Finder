import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToString} from 'react-dom/server';
import {createServer} from 'vite';
const server=await createServer({configFile:false,server:{middlewareMode:true,hmr:false},esbuild:{jsx:'automatic'}});
after(()=>server.close());
const {extractRodObtainment}=await server.ssrLoadModule('/src/lib/rod-obtainment.ts');
const {craftingPath}=await server.ssrLoadModule('/src/lib/rod-crafting.ts');
const {withPurchaseAreas}=await server.ssrLoadModule('/src/lib/rod-access-cache.ts');
const {rodFallback}=await server.ssrLoadModule('/src/lib/rods.ts');
const {default:Tree}=await server.ssrLoadModule('/src/components/RodQuestTree.tsx');
const {questFallback}=await server.ssrLoadModule('/src/lib/quests.ts');
const target=page=>rodFallback.rods.find(r=>r.page===page);
const render=(rod,data)=>renderToString(React.createElement(Tree,{rod,rods:rodFallback.rods,data,request(){},loading:false,error:''})).replace(/<!--[\s\S]*?-->/g,'');

test('all 34 saved crafting rods expose complete counted recipes; the retired Moosewood route remains historical',()=>{
 const rods=rodFallback.rods.filter(r=>/craft/i.test(r.source));assert.equal(rods.length,34);
 for(const rod of rods){const path=craftingPath(rod);assert.ok(path?.recipes.length,rod.page);assert.ok(path.recipes.every(r=>r.ingredients.length&&r.ingredients.every(i=>i.quantity)),rod.page);assert.ok(rod.craftingAccess?.area,rod.page);}
 const old=target('Rod Of Time');assert.equal(craftingPath(old).accessPage,'Moosewood');assert.ok(old.unavailable);assert.match(render(old),/recipe may be historical/);
});
test('separate recipe attributes, legacy slash notes, default counts, zero prices and event currencies are preserved',()=>{
 const parsed=extractRodObtainment('== Obtainment ==\n{{Recipe|level=50|price=0|sort=Ruby;Driftwood;Magic Thread|Ruby=1|Driftwood=2/Mythical|Driftwood_attrs=Sparkling|Magic Thread_attrs=Shiny}}');
 assert.equal(parsed.version,3);assert.equal(parsed.price,'C$ 0');assert.deepEqual(parsed.recipes[0].ingredients.map(i=>[i.page,i.quantity,i.attributes]),[['Ruby','1',''],['Driftwood','2','Sparkling · Mythical'],['Magic Thread','1','Shiny']]);
 assert.equal(craftingPath(target('North Pole')).recipes[0].price,'Bells 15,000');
 const summer=craftingPath(target('Sand Castle Caster')).recipes[0];assert.equal(summer.price,'Sunshells 5,000');assert.equal(summer.ingredients.find(i=>i.page==='Sand Fort').attributes,'Sandy');
 const abaia=craftingPath(target("Abaia's Spite")).recipes[0];assert.equal(abaia.ingredients.find(i=>i.page==='Abaia').quantity,'1');assert.equal(abaia.ingredients.find(i=>i.page==='Empyrean Relic').attributes,'Petrified');
});
test('recipe tree separates ingredient facts and the complete Archives access puzzle without inheriting fishing sections',()=>{
 const rod=target('Cusk Purger');const html=render(rod);assert.equal((html.match(/Crafting ingredient/g)||[]).length,7);assert.match(html,/×3/);assert.match(html,/C\$ 750,000/);assert.match(html,/Ancient Isle → Ancient Archives/);
 for(const fragment of ['Deep Sea','Solar','Earth','Ancient'])assert.match(html,new RegExp(fragment+' Fragment'));
 assert.match(html,/Eclipse/);assert.match(html,/remain open permanently/);assert.match(html,/glider/);assert.match(html,/5870, 160, 415/);
 assert.ok(!html.includes('Bestiary')&&!html.includes('four players'),'current wiki no longer requires four players');
 assert.ok(html.indexOf('Desired rod')<html.indexOf('Crafting recipe'));assert.ok(html.indexOf('Crafting recipe')<html.indexOf('Recipe requirements'));assert.ok(html.indexOf('Recipe requirements')<html.indexOf('Area access'));
 assert.match(html,/Ancient_Isle#Ancient_Archives/);
 assert.ok(!craftingPath(rod).steps.some(step=>/Monstrous Cusk Tooth ×|Rod Journal/.test(step.text)),'compact cards do not repeat the recipe or journal XP');
});
test('attribute guidance reuses mutation alternatives and excludes the desired rod from circular recommendations',()=>{
 const html=render(target('Wisdom Rod'),questFallback);assert.match(html,/Mythical/);assert.match(html,/Mythical Rod/);assert.match(html,/Suggested method/);assert.match(html,/Owned or traded materials/);
 const spirit=render(target('Spiritbinder'),questFallback);assert.ok(!spirit.includes('Show Spiritbinder prerequisites'));
 assert.match(spirit,/Required attributes/);assert.match(spirit,/Spirit/);
});
test('multiple recipes retain their own quantities and costs, and a purchase alternative stays separate',()=>{
 const rod={...target('Wisdom Rod'),source:'Quest',obtainment:extractRodObtainment('== Obtainment ==\n=== Crafting ===\nCraft at [[Ancient Archives]].\n{{Recipe|level=5|price=0|sort=Ruby|Ruby=2}}\n{{Recipe|level=50|price=500|sort=Ruby|Ruby=3}}\n=== Purchasing ===\nAlternatively buy from [[Shopkeeper]].')};
 const html=render(rod);assert.match(html,/Recipe option 1/);assert.match(html,/Recipe option 2/);assert.match(html,/×2/);assert.match(html,/×3/);assert.match(html,/C\$ 500/);assert.match(html,/Purchase option/);assert.ok(!html.includes('<h5>Shopkeeper</h5>'));
});
test('missing recipes do not invent materials and crafting does not appear for ordinary purchase rods',()=>{
 const missing={...target('Wisdom Rod'),obtainment:extractRodObtainment('== Obtainment ==\nCraft at [[Ancient Archives]] after [[Level]] 50. See [[Rod Journal]].')};
 assert.match(render(missing),/no complete ingredient recipe was imported/);assert.equal(craftingPath(missing).recipes.length,0);
 assert.equal(craftingPath(target('Decayed Rod')),undefined);assert.match(render(target('Decayed Rod')),/Purchase location/);
});
test('Archives text is shared by all crafting rods, revalidated incrementally and retained when the source fails',async()=>{
 const rods=[target('Wisdom Rod'),target('Cusk Purger')];let calls=[],fail=false;
 const request=async params=>{calls.push(params);if(fail)throw new Error('Offline');return {query:{redirects:[{from:'Ancient Archives',to:'Ancient Isle'}],pages:[{pageid:1,title:'Ancient Isle',revisions:[{revid:181789}]}]}};};
 const first=await withPurchaseAreas(rods,request);assert.equal(calls.filter(p=>p.titles==='Ancient Archives').length,1);assert.ok(calls.every(p=>!p.rvprop.includes('content')));assert.deepEqual(first[0].craftingAccess,first[1].craftingAccess);
 fail=true;const offline=await withPurchaseAreas(rods,request);assert.deepEqual(offline[0].craftingAccess,first[0].craftingAccess);
});
