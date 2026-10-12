import test from 'node:test';
import assert from 'node:assert/strict';
import { moduleUri } from './compile-module.mjs';
const { datasetResponse, cooldownResponse } = await import(moduleUri(new URL('../src/lib/dataset-response.ts',import.meta.url)));
const { datasetVersion } = await import(moduleUri(new URL('../src/lib/dataset-version.ts',import.meta.url)));
const { DATASET_MAX_AGE, MANUAL_REFRESH_COOLDOWN } = await import(moduleUri(new URL('../src/lib/refresh-policy.ts',import.meta.url)));
test('unchanged facts return no body, changed facts and failed checks remain visible',async()=>{
 const data={fetchedAt:new Date().toISOString(),mode:'api',notice:'',rows:['one']};
 const first=await datasetResponse(new Request('https://test/api/fish.json'),data,Date.now()+MANUAL_REFRESH_COOLDOWN);
 assert.equal(first.status,200);const etag=first.headers.get('ETag');assert.equal(etag,await datasetVersion(data));
 assert.equal(first.headers.get('X-Dataset-Max-Age'),'21600');
 const later={...data,fetchedAt:new Date(Date.now()+1000).toISOString()};
 const unchanged=await datasetResponse(new Request('https://test/api/fish.json',{headers:{'If-None-Match':etag}}),later,0);
 assert.equal(unchanged.status,304);assert.equal(await unchanged.text(),'');assert.equal(unchanged.headers.get('X-Dataset-Fetched-At'),later.fetchedAt);
 const manual=await datasetResponse(new Request('https://test/api/fish.json',{method:'POST',headers:{'If-None-Match':etag}}),later,0);
 assert.equal(manual.status,204);assert.equal(await manual.text(),'');assert.equal(manual.headers.get('Cache-Control'),'no-store');
 const changed=await datasetResponse(new Request('https://test/api/fish.json',{headers:{'If-None-Match':etag}}),{...later,rows:['one','two']},0);
 assert.equal(changed.status,200);assert.notEqual(changed.headers.get('ETag'),etag);assert.deepEqual((await changed.json()).rows,['one','two']);
 const failed=await datasetResponse(new Request('https://test/api/fish.json',{headers:{'If-None-Match':etag}}),{...later,mode:'snapshot',notice:'Wiki unavailable'},0);
 assert.equal(failed.status,200);assert.equal((await failed.json()).mode,'snapshot');
 const limited=cooldownResponse(Date.now()+MANUAL_REFRESH_COOLDOWN);assert.equal(limited.status,429);assert.equal(limited.headers.get('Retry-After'),'300');assert.ok((await limited.text()).length<100);
 assert.equal(DATASET_MAX_AGE,21600000);
});
test('cooldowns survive reloads, synchronize storage, and have a private-mode fallback',async()=>{
 const old=globalThis.window,originalNow=Date.now;let now=originalNow(),saved=new Map();Date.now=()=>now;
 const storage={getItem:k=>saved.get(k)??null,setItem:(k,v)=>saved.set(k,v)};globalThis.window={localStorage:storage};
 const code=Buffer.from(moduleUri(new URL('../src/lib/refresh-cooldown.ts',import.meta.url)).split(',')[1],'base64').toString();
 const fresh=n=>import('data:text/javascript;base64,'+Buffer.from(code+'\n// '+n).toString('base64'));
 try {
  const one=await fresh(1);one.holdRefresh('/api/fish.json?schema=2');
  const two=await fresh(2);assert.equal(two.refreshAvailableAt('/api/fish.json?schema=3'),now+300000);
  assert.equal(two.refreshAvailableAt('/api/rods.json'),0);assert.equal(two.cooldownLabel(272),'Refresh available in 4:32');
  now+=300001;assert.equal(two.refreshAvailableAt('/api/fish.json'),0);
  globalThis.window={get localStorage(){throw Error('Denied');}};
  one.holdRefresh('/api/rods.json');assert.equal(one.refreshAvailableAt('/api/rods.json'),now+300000);
  assert.equal(one.refreshAvailableAt('/api/schedules.json'),0);
 }finally{globalThis.window=old;Date.now=originalNow;}
});
