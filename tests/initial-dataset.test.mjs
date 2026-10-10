import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const code=ts.transpileModule(fs.readFileSync(new URL('../src/lib/initial-dataset.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {initialDataset}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
test('initial page data uses success and preserves fallback on rejection or timeout',async()=>{
 const saved={mode:'snapshot'},live={mode:'api'};
 assert.equal(await initialDataset(async()=>live,saved),live);
 assert.equal(await initialDataset(async()=>{throw Error('Offline');},saved),saved);
 assert.equal(await initialDataset(()=>{throw Error('Sync failure');},saved),saved);
 assert.equal(await initialDataset(()=>new Promise(()=>{}),saved,5),saved);
});
