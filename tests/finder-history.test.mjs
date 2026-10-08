import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const source = fs.readFileSync(new URL('../src/lib/finder-history.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const helper = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));

test('filter URL updates preserve opaque router state and never add a history entry', () => {
 const saved = globalThis.window;
 const state = { index: 4, scrollX: 0, scrollY: 350, custom: { keep: true } };
 const calls = [];
 globalThis.window = { history: { state, replaceState: (...args) => calls.push(args), pushState: () => assert.fail('filter updates must not create history entries') } };
 try {
  helper.replaceFinderUrl('/quests?q=Mysterious+Shadow&status=');
  assert.equal(calls[0][0], state);
  assert.deepEqual(calls[0].slice(1), ['', '/quests?q=Mysterious+Shadow&status=']);
  globalThis.window.history.state = null;
  helper.replaceFinderUrl('/');
  assert.deepEqual(calls[1], [null, '', '/']);
 } finally { globalThis.window = saved; }
});

test('history reads stay with their finder while the router swaps pages; cleanup removes the listener', () => {
 const saved = globalThis.window;
 const listeners = new Map(); let reads = 0;
 globalThis.window = { location: { pathname: '/rods' }, addEventListener: (name,fn) => listeners.set(name,fn), removeEventListener: (name,fn) => { assert.equal(listeners.get(name),fn); listeners.delete(name); } };
 try {
  const stop = helper.listenForFinderHistory(() => reads++);
  listeners.get('popstate')(); assert.equal(reads,1);
  globalThis.window.location.pathname = '/quests';
  listeners.get('popstate')(); assert.equal(reads,1);
  globalThis.window.location.pathname = '/rods';
  listeners.get('popstate')(); assert.equal(reads,2);
  stop(); assert.equal(listeners.size,0);
 } finally { globalThis.window = saved; }
});
