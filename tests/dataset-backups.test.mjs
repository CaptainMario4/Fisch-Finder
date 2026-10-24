import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {validBackup,updateBackup,decodeBackup,encodeBackup,kinds} from '../scripts/dataset-backups.mjs';
const saved=decodeBackup(JSON.parse(fs.readFileSync(new URL('../src/data/last-good-datasets.json',import.meta.url))));
test('all saved datasets are complete and compressed round trips preserve every feature',()=>{
 for(const kind of kinds)assert.equal(validBackup(kind,saved[kind]),true,kind);
 assert.deepEqual(decodeBackup(encodeBackup(saved)),saved);
 assert.throws(()=>decodeBackup({schema:1,encoding:'gzip-base64',data:'broken'}));
});
test('failed, older, incomplete and malformed captures cannot replace the saved data',()=>{
 const input=structuredClone(saved);input.fish.mode='snapshot';input.rods.rods=input.rods.rods.slice(0,1);input.companions.companions[0].abilities=null;input.quests.fetchedAt='2000-01-01';
 assert.deepEqual(updateBackup(saved,input),saved);
 const next=structuredClone(saved);next.fish.fetchedAt=new Date(Date.parse(saved.fish.fetchedAt)+1000).toISOString();
 assert.equal(updateBackup(saved,next).fish.fetchedAt,next.fish.fetchedAt);
});
