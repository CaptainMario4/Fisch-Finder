import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const source=fs.readFileSync(new URL('../src/lib/visited-pages.ts',import.meta.url),'utf8');
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
let id=0;
const fresh=()=>import('data:text/javascript;base64,'+Buffer.from(code+'\n// '+id++).toString('base64'));
const props=(time,mode='api')=>JSON.stringify({initialData:[0,{fetchedAt:[0,new Date(time).toISOString()],mode:[0,mode]}]});
test('visited documents retain source expiry, are isolated, and only public finders qualify',async()=>{
 const {visitedPages,pageExpiry,finderPath}=await fresh(),now=Date.now();
 assert.equal(finderPath(new URL('https://test/rods?q=Sunken&rod=Sunken'), 'https://test'),'/rods');
 assert.equal(finderPath(new URL('https://other/rods'),'https://test'),undefined);
 assert.equal(finderPath(new URL('https://test/api/rods.json'),'https://test'),undefined);
 assert.equal(pageExpiry(props(now-600000),now),now+1200000);
 assert.equal(pageExpiry(props(now,'snapshot'),now),now+60000);
 assert.equal(pageExpiry('broken',now),0);
 const cache=visitedPages(v=>structuredClone(v)),doc={rows:['one']};
 cache.put('/rods',doc,now+10000);doc.rows.push('mutated live tree');
 const first=cache.get('/rods');assert.deepEqual(first.rows,['one']);first.rows.push('changed swap');
 assert.deepEqual(cache.get('/rods').rows,['one']);
 cache.delete('/rods');assert.equal(cache.get('/rods'),undefined);
 cache.put('/quests',doc,now-1);assert.equal(cache.get('/quests'),undefined);
});
test('router reuse bypasses downloads, preserves the pristine document, and invalidates on refresh',async()=>{
 const original={document:globalThis.document,location:globalThis.location};
 const listeners=new Map(),bar={dataset:{}},root={dataset:{}},body={dataset:{}};
 const current={body,documentElement:root,querySelector:()=>bar,addEventListener:(n,f)=>listeners.set(n,f)};
 globalThis.document=current;globalThis.location={origin:'https://test'};
 const makeDoc=()=>({querySelector:selector=>selector.startsWith('astro-island')?{getAttribute:()=>props(Date.now())}:true,cloneNode:()=>makeDoc()});
 try {
  const {installVisitedPages}=await fresh();installVisitedPages();installVisitedPages();
  let downloads=0;
  const event=()=>({to:new URL('https://test/rods?q=Sunken'),signal:new AbortController().signal,newDocument:current,defaultPrevented:false,loader:async function(){downloads++;this.newDocument=makeDoc();}});
  const before=listeners.get('astro:before-preparation');
  const first=event();first.loader=first.loader.bind(first);before(first);await first.loader();assert.equal(downloads,1);
  listeners.get('astro:page-load')();assert.equal(root.dataset.navSource,'network');
  const second=event();before(second);await second.loader();assert.equal(downloads,1);assert.notEqual(second.newDocument,first.newDocument);
  listeners.get('astro:page-load')();assert.equal(root.dataset.navSource,'memory');
  listeners.get('fischfinder:dataset-refreshed')({detail:'/api/rods.json?schema=7'});
  const third=event();third.loader=third.loader.bind(third);before(third);await third.loader();assert.equal(downloads,2);
  const form=event();form.formData={};const originalLoader=form.loader;before(form);assert.equal(form.loader,originalLoader);
  const aborted=event();aborted.signal=AbortSignal.abort();before(aborted);await aborted.loader();assert.equal(downloads,2);
 } finally {globalThis.document=original.document;globalThis.location=original.location;}
});
