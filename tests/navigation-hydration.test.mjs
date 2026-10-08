import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { createServer } from 'vite';
import { parseFragment } from 'parse5';

// Astro's ClientRouter parses the incoming document, then removes all noscript
// elements before swapping it. React must receive the same island tree it SSR'd.
function shape(node, removeNoscript = false) {
 if (removeNoscript && node.tagName === 'noscript') return null;
 return { name: node.nodeName, text: node.value, attrs: node.attrs,
  children: (node.childNodes || []).map(child => shape(child, removeNoscript)).filter(Boolean) };
}
const initialTree = html => shape(parseFragment(html, { scriptingEnabled: true }));
const navigatedTree = html => shape(parseFragment(html, { scriptingEnabled: false }), true);

test('navigation fixture detects a React-owned noscript removed by the router', () => {
 const previousMarkup = renderToString(React.createElement('section', null,
  React.createElement('h1', null, 'Finder'),
  React.createElement('noscript', null, React.createElement('p', null, 'Enable JavaScript'))));
 assert.notDeepEqual(navigatedTree(previousMarkup), initialTree(previousMarkup));
});

test('fish and rod islands retain identical hydration trees after client navigation', async t => {
 const server = await createServer({ configFile: false, server: { middlewareMode: true }, esbuild: { jsx: 'automatic' } });
 try {
  for (const [component, lib, fallback, page] of [
   ['FishDatabase', 'fisch', 'fallback', 'index'], ['RodDatabase', 'rods', 'rodFallback', 'rods'],
  ]) {
   await t.test(component, async () => {
    const { default: Component } = await server.ssrLoadModule(`/src/components/${component}.tsx`);
    const data = await server.ssrLoadModule(`/src/lib/${lib}.ts`);
    const props = { initialData: data[fallback] };
    if (component === 'FishDatabase') props.initialSchedules = (await server.ssrLoadModule('/src/lib/schedules.ts')).scheduleFallback;
    const html = renderToString(React.createElement(Component, props));
    assert.deepEqual(navigatedTree(html), initialTree(html));
    // The disabled-JavaScript message still exists in the enclosing Astro page.
    const template = fs.readFileSync(new URL(`../src/pages/${page}.astro`, import.meta.url), 'utf8');
    const fallbackMarkup = template.match(/<noscript>[\s\S]*?<\/noscript>/)?.[0];
    assert.ok(fallbackMarkup, 'keep the JavaScript-disabled fallback');
    const documentMarkup = `<astro-island>${html}</astro-island>${fallbackMarkup}`;
    const parsed = parseFragment(documentMarkup, { scriptingEnabled: false });
    assert.equal(parsed.childNodes[0].tagName, 'astro-island');
    assert.equal(parsed.childNodes[1].tagName, 'noscript');
    assert.match(parsed.childNodes[1].childNodes[0].childNodes[0].value, /Enable JavaScript/);
   });
  }
 } finally { await server.close(); }
});
