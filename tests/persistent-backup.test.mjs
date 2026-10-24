import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {validBackup,updateBackup,decodeBackup,encodeBackup,kinds} from '../scripts/dataset-backups.mjs';
const saved=decodeBackup(JSON.parse(fs.readFileSync(new URL('../src/data/last-good-datasets.json',import.meta.url))));
test('fresh server recovers bundled and newer remote data without downgrading or hiding outage',async()=>{
 const {createServer}=await import('vite');const server=await createServer({configFile:false,server:{middlewareMode:true,hmr:false}});const original=globalThis.fetch;
 try {
  const module=await server.ssrLoadModule('/src/lib/persistent-backup.ts');const old={...saved.fish,mode:'snapshot',fetchedAt:'2026-10-07T00:00:00Z'};
  const bundled=module.savedDataset('fish',old);assert.equal(bundled.fetchedAt,saved.fish.fetchedAt);assert.equal(bundled.mode,'snapshot');
  let calls=0;const newer=structuredClone(saved);newer.fish.fetchedAt=new Date(Date.parse(saved.fish.fetchedAt)+1000).toISOString();
  globalThis.fetch=async()=>{calls++;return new Response(JSON.stringify(encodeBackup(newer)));};
  const [a,b]=await Promise.all([module.recoverDataset('fish',old),module.recoverDataset('fish',old)]);
  assert.equal(calls,1);assert.equal(a.fetchedAt,newer.fish.fetchedAt);assert.equal(b.fetchedAt,a.fetchedAt);assert.equal(a.mode,'snapshot');
  assert.equal(await module.recoverDataset('fish',saved.fish),saved.fish);
  const cold=await server.ssrLoadModule('/src/lib/persistent-backup.ts?offline');globalThis.fetch=async()=>{throw Error('Offline');};
  const offline=await cold.recoverDataset('fish',old);assert.equal(offline.fetchedAt,saved.fish.fetchedAt);assert.equal(offline.mode,'snapshot');
 } finally {globalThis.fetch=original;await server.close();}
});
