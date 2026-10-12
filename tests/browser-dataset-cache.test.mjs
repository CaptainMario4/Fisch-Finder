import { moduleUri } from './compile-module.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const source = fs.readFileSync(new URL('../src/lib/browser-dataset-cache.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const browserDependencies = ['dataset-version','refresh-cooldown','refresh-policy'];
let id = 0;
const fresh = () => import('data:text/javascript;base64,' + Buffer.from(browserDependencies.reduce((code,name)=>code.replace(`from './${name}'`, `from '${moduleUri(new URL('../src/lib/'+name+'.ts',import.meta.url))}'`),compiled) + `\n// ${id++}`).toString('base64'));
const validate = value => Array.isArray(value.rows) && value.rows.length > 0;
const ttl = 1800000;
const options = force => ({ force, signal: new AbortController().signal, maxAge: ttl });

test('public data cache preserves refresh, expiry, and storage failure behavior', async t => {
 const saved = { fetch, Date, window: globalThis.window, setTimeout, clearTimeout };
 let clock = saved.Date.now(), calls = [], stored = new Map();
 globalThis.Date = class extends saved.Date { constructor(...args) { super(...(args.length ? args : [clock])); } static now() { return clock; } };
 const storage = { getItem: key => stored.get(key) ?? null, setItem: (key,value) => stored.set(key,value), removeItem: key => stored.delete(key) };
 globalThis.window = { sessionStorage: storage };
 const value = () => ({ fetchedAt: new saved.Date(clock).toISOString(), mode:'api', rows:['fish'] });
 globalThis.fetch = async (url, opts) => { calls.push(opts.method); return { ok:true, json:async()=>value() }; };
 try {
  await t.test('navigation reuses session data, manual refresh bypasses it, failures retain it', async()=>{
   let mod = await fresh(); const first = await mod.fetchDataset('/data',options(false),validate);
   mod = await fresh(); assert.deepEqual(await mod.fetchDataset('/data',options(false),validate),first); assert.deepEqual(calls,['GET']);
   clock += 61000; await mod.fetchDataset('/data',options(true),validate); assert.deepEqual(calls,['GET','POST']);
   const successfulFetch = globalThis.fetch; globalThis.fetch = async()=>{throw Error('Offline');};
   await assert.rejects(mod.fetchDataset('/data',options(true),validate),/Offline/);
   assert.equal((await (await fresh()).fetchDataset('/data',options(false),validate)).fetchedAt,value().fetchedAt);
   globalThis.fetch = successfulFetch;
  });
  await t.test('expiry uses source time, including older CDN responses',async()=>{
   const mod=await fresh(); const sourceTime=clock-ttl+10000;
   globalThis.fetch=async()=>({ok:true,json:async()=>({...value(),fetchedAt:new saved.Date(sourceTime).toISOString()})});
   await mod.fetchDataset('/old',options(false),validate); clock+=11000;
   globalThis.fetch=async()=>{calls.push('GET');return {ok:true,json:async()=>value()};};
   const count=calls.length; await mod.fetchDataset('/old',options(false),validate); assert.equal(calls.length,count+1);
  });
  await t.test('corrupted cache and invalid server data cannot replace data',async()=>{
   stored.set('fischfinder:dataset:v1:/corrupt','broken JSON');
   const mod=await fresh(); const count=calls.length; await mod.fetchDataset('/corrupt',options(false),validate); assert.equal(calls.length,count+1);
   globalThis.fetch=async()=>({ok:true,json:async()=>({fetchedAt:'invalid',mode:'api',rows:[]})});
   await assert.rejects(mod.fetchDataset('/corrupt',options(true),validate),/Invalid dataset/);
   assert.deepEqual((await (await fresh()).fetchDataset('/corrupt',options(false),validate)).rows,['fish']);
  });
  await t.test('denied storage and quota errors preserve rendering and memory cache',async()=>{
   globalThis.window={get sessionStorage(){throw Error('Denied');}};
   let count=0; globalThis.fetch=async()=>{count++;return {ok:true,json:async()=>value()};};
   const mod=await fresh(); await mod.fetchDataset('/private',options(false),validate); await mod.fetchDataset('/private',options(false),validate); assert.equal(count,1);
   globalThis.window={sessionStorage:{...storage,setItem(){throw Error('Quota');}}};
   await mod.fetchDataset('/quota',options(false),validate); await mod.fetchDataset('/quota',options(false),validate); assert.equal(count,2);
  });
  await t.test('fresh server data avoids GET, retains source expiry, and still allows POST',async()=>{
   globalThis.window={sessionStorage:storage}; let count=0;
   globalThis.fetch=async()=>{count++;return {ok:true,json:async()=>value()};};
   const mod=await fresh(), initial={...value(),fetchedAt:new saved.Date(clock-600000).toISOString()};
   assert.deepEqual(await mod.fetchDataset('/seed',{...options(false),initialData:initial},validate),initial);
   assert.equal(count,0);
   assert.equal(JSON.parse(stored.get('fischfinder:dataset:v1:/seed')).expiresAt,clock+ttl-600000);
   await mod.fetchDataset('/seed',{...options(true),initialData:initial},validate);assert.equal(count,1);
  });
  await t.test('expired, snapshot, and invalid initial data still refresh',async()=>{
   let count=0;globalThis.fetch=async()=>{count++;return {ok:true,json:async()=>value()};};
   const mod=await fresh();
   for(const [i,initialData] of [{...value(),fetchedAt:new saved.Date(clock-ttl).toISOString()},{...value(),mode:'snapshot'},{...value(),rows:[]}].entries())
    await mod.fetchDataset('/untrusted'+i,{...options(false),initialData},validate);
   assert.equal(count,3);
  });
  await t.test('newer session data wins over server data, including denied storage',async()=>{
   let count=0;globalThis.fetch=async()=>{count++;return {ok:true,json:async()=>value()};};
   const mod=await fresh(); const recent=await mod.fetchDataset('/newer',options(false),validate);
   const old={...value(),fetchedAt:new saved.Date(clock-60000).toISOString()};
   assert.deepEqual(await mod.fetchDataset('/newer',{...options(false),initialData:old},validate),recent);assert.equal(count,1);
   globalThis.window={get sessionStorage(){throw Error('Denied');}};
   await mod.fetchDataset('/seed-private',{...options(false),initialData:value()},validate);
   await mod.fetchDataset('/seed-private',options(false),validate);assert.equal(count,1);
  });
  await t.test('aborted requests do not write data',async()=>{
   const controller=new AbortController(); controller.abort(); const count=calls.length;
   await assert.rejects((await fresh()).fetchDataset('/abort',{...options(false),signal:controller.signal},validate),{name:'AbortError'}); assert.equal(calls.length,count);
  });
  await t.test('successful manual refresh invalidates only its visited page',async()=>{
   const previousDoc=globalThis.document,previousEvent=globalThis.CustomEvent,events=[];
   globalThis.document={dispatchEvent:event=>events.push(event)};
   globalThis.CustomEvent=class {constructor(type,options){this.type=type;this.detail=options.detail;}};
   globalThis.fetch=async()=>({ok:true,json:async()=>value()});
   try {
    const mod=await fresh();await mod.fetchDataset('/api/rods.json?schema=7',options(false),validate);assert.equal(events.length,0);
    await mod.fetchDataset('/api/rods.json?schema=7',options(true),validate);
    assert.equal(events.length,1);assert.equal(events[0].type,'fischfinder:dataset-refreshed');assert.equal(events[0].detail,'/api/rods.json?schema=7');
   } finally {globalThis.document=previousDoc;globalThis.CustomEvent=previousEvent;}
  });
  await t.test('conditional GET and POST retain facts, advance check time, and suppress repeated POSTs',async()=>{
   globalThis.window={sessionStorage:storage};clock+=301000;
   const mod=await fresh(),endpoint='/api/fish.json?schema=2',hours=21600000,events=[];
   const opts=force=>({...options(force),maxAge:hours});
   const first=value();
   const {datasetVersion}=await import(moduleUri(new URL('../src/lib/dataset-version.ts',import.meta.url)));
   const etag=await datasetVersion(first);
   globalThis.fetch=async(url,request)=>{events.push(request.method);return new Response(JSON.stringify(first),{headers:{ETag:etag,'X-Refresh-Wait':'0'}});};
   await mod.fetchDataset(endpoint,opts(false),validate);clock+=hours+1;
   globalThis.fetch=async(url,request)=>{events.push(request.method);assert.equal(request.headers['If-None-Match'],etag);assert.equal(new URL(url,'https://test').searchParams.get('version'),etag);return new Response(JSON.stringify({unchanged:true}),{status:200,headers:{ETag:etag,'X-Dataset-Fetched-At':new saved.Date(clock).toISOString(),'X-Refresh-Wait':'0'}});};
   const checked=await mod.fetchDataset(endpoint,opts(false),validate);assert.deepEqual(checked.rows,first.rows);assert.notEqual(checked.fetchedAt,first.fetchedAt);
   clock+=301000;
   globalThis.fetch=async(url,request)=>{events.push(request.method);return new Response(JSON.stringify({unchanged:true}),{status:200,headers:{ETag:etag,'X-Dataset-Fetched-At':new saved.Date(clock).toISOString(),'X-Refresh-Wait':'300'}});};
   const manual=await mod.fetchDataset(endpoint,opts(true),validate);assert.deepEqual(manual.rows,first.rows);
   assert.deepEqual(await mod.fetchDataset(endpoint,opts(true),validate),manual);assert.deepEqual(events,['GET','GET','POST']);
   const source=JSON.parse(stored.get('fischfinder:dataset:v1:'+endpoint));assert.equal(source.expiresAt,clock+hours);
  });
  await t.test('server cooldown returns a small response while the previous data stays usable',async()=>{
   const mod=await fresh(),endpoint='/api/companions.json?schema=1';
   globalThis.fetch=async()=>new Response(JSON.stringify(value()));const first=await mod.fetchDataset(endpoint,options(false),validate);
   globalThis.fetch=async()=>new Response('cooldown',{status:429,headers:{'Retry-After':'300'}});
   assert.deepEqual(await mod.fetchDataset(endpoint,options(true),validate),first);
  });
  await t.test('polling uses remaining freshness and disposal cancels subsequent checks',async()=>{
   globalThis.window={sessionStorage:storage}; globalThis.fetch=async()=>({ok:true,json:async()=>value()}); let scheduled, canceled, checks=0;
   globalThis.setTimeout=(callback,delay)=>{scheduled={callback,delay};return 7;};globalThis.clearTimeout=timer=>{canceled=timer;};
   const mod=await fresh(); await mod.fetchDataset('/poll',options(false),validate);clock+=600000;
   const stop=mod.pollDataset('/poll',async()=>{checks++;},ttl);
   await Promise.resolve();await Promise.resolve();assert.equal(checks,1);assert.equal(scheduled.delay,ttl-600000+1000);
   stop();assert.equal(canceled,7);
  });
 } finally {globalThis.fetch=saved.fetch;globalThis.Date=saved.Date;globalThis.window=saved.window;globalThis.setTimeout=saved.setTimeout;globalThis.clearTimeout=saved.clearTimeout;}
});

test('hidden pages pause checks and repeated focus does not retry failed checks',async()=>{
 const original={document:globalThis.document,window:globalThis.window,setTimeout,clearTimeout,now:Date.now};
 const listeners=new Map();let clock=Date.now(),checks=0,delay;
 globalThis.document={visibilityState:'hidden',addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name),dispatchEvent:()=>true};
 globalThis.window={addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name)};
 globalThis.setTimeout=(fn,ms)=>{delay=ms;return 8;};globalThis.clearTimeout=()=>{};Date.now=()=>clock;
 try {
  const mod=await fresh(),ttl=21600000;const stop=mod.pollDataset('/api/quests.json?schema=4',async()=>{checks++;},ttl);
  assert.equal(checks,0);globalThis.document.visibilityState='visible';listeners.get('visibilitychange')();
  await Promise.resolve();await Promise.resolve();assert.equal(checks,1);assert.equal(delay,ttl);
  listeners.get('focus')();assert.equal(checks,1);clock+=ttl+1;listeners.get('focus')();await Promise.resolve();await Promise.resolve();assert.equal(checks,2);
  stop();assert.equal(listeners.size,0);
 } finally {globalThis.document=original.document;globalThis.window=original.window;globalThis.setTimeout=original.setTimeout;globalThis.clearTimeout=original.clearTimeout;Date.now=original.now;}
});
