import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const source = fs.readFileSync(new URL('../src/lib/browser-dataset-cache.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
let id = 0;
const fresh = () => import('data:text/javascript;base64,' + Buffer.from(compiled + `\n// ${id++}`).toString('base64'));
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
  await t.test('polling uses remaining freshness and disposal cancels subsequent checks',async()=>{
   globalThis.window={sessionStorage:storage}; let scheduled, canceled, checks=0;
   globalThis.setTimeout=(callback,delay)=>{scheduled={callback,delay};return 7;};globalThis.clearTimeout=timer=>{canceled=timer;};
   const mod=await fresh(); await mod.fetchDataset('/poll',options(false),validate);clock+=600000;
   const stop=mod.pollDataset('/poll',async()=>{checks++;},ttl);
   await Promise.resolve();await Promise.resolve();assert.equal(checks,1);assert.equal(scheduled.delay,ttl-600000+1000);
   stop();assert.equal(canceled,7);
  });
 } finally {globalThis.fetch=saved.fetch;globalThis.Date=saved.Date;globalThis.window=saved.window;globalThis.setTimeout=saved.setTimeout;globalThis.clearTimeout=saved.clearTimeout;}
});
