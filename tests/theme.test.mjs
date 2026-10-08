import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const layout = fs.readFileSync(new URL('../src/layouts/Layout.astro', import.meta.url), 'utf8');
const bootstrap = layout.match(/<script is:inline data-astro-rerun>([\s\S]*?)<\/script>/)[1];
function browser({ saved = null, blocked = false, readOnly = false } = {}) {
  const listeners = new Map();
  const add = target => (name, callback, capture = false) => {
    const key = target + ':' + name;
    listeners.set(key, [...(listeners.get(key) ?? []), { callback, capture }]);
  };
  class Element { closest(selector) { return selector === '[data-theme-toggle]' ? this : null; } }
  const button = new Element(); button.attributes = {};
  button.setAttribute = (key, value) => { button.attributes[key] = value; };
  const document = { documentElement: { dataset: {} }, querySelectorAll: () => [button], addEventListener: add('document') };
  const window = { addEventListener: add('window') };
  const localStorage = {
    getItem: () => { if (blocked) throw new Error('Storage blocked'); return saved; },
    setItem: (_key, value) => { if (blocked || readOnly) throw new Error('Storage write blocked'); saved = value; },
  };
  const context = vm.createContext({ document, window, localStorage, Element });
  const run = () => vm.runInContext(bootstrap, context);
  const emit = (target, name, fields = {}) => {
    let stopped = false;
    const event = { ...fields, stopImmediatePropagation: () => { stopped = true; } };
    const ordered = [...(listeners.get(target + ':' + name) ?? [])].sort((a, b) => Number(b.capture) - Number(a.capture));
    for (const listener of ordered) { if (stopped) break; listener.callback(event); }
  };
  const navigate = () => {
    const newDocument = { documentElement: { dataset: {} } };
    emit('document', 'astro:before-swap', { newDocument });
    assert.equal(newDocument.documentElement.dataset.theme, document.documentElement.dataset.theme);
    // Replacing a document or restoring cached HTML must not reset the choice.
    document.documentElement = { dataset: {} };
    emit('document', 'astro:after-swap'); run(); emit('document', 'astro:page-load');
  };
  return { run, document, button, listeners, emit, navigate, click: () => emit('document', 'click', { target: button }), saved: () => saved };
}

test('dark and light choices survive first page navigation, return navigation, and rerun bootstraps', () => {
  const page = browser({ saved: 'light' }); page.run(); assert.equal(page.document.documentElement.dataset.theme, 'light');
  page.click(); assert.equal(page.saved(), 'dark');
  page.navigate(); page.navigate();
  assert.equal(page.document.documentElement.dataset.theme, 'dark');
  assert.equal(page.button.attributes['aria-checked'], 'true');
  assert.equal(page.listeners.get('document:click').length, 1);
  page.click(); page.navigate();
  assert.equal(page.document.documentElement.dataset.theme, 'light');
  assert.equal(page.button.attributes['aria-checked'], 'false');
  const reload = browser({ saved: page.saved() }); reload.run();
  assert.equal(reload.document.documentElement.dataset.theme, 'light');
});

test('saved dark preference restores before paint, across browser tabs, and on history restoration', () => {
  const page = browser({ saved: 'dark' }); page.run();
  assert.equal(page.document.documentElement.dataset.theme, 'dark');
  page.emit('window', 'storage', { key: 'fisch-finder-theme', newValue: 'light' });
  page.navigate(); assert.equal(page.document.documentElement.dataset.theme, 'light');
  page.emit('window', 'pageshow'); assert.equal(page.document.documentElement.dataset.theme, 'dark');
});

test('navigation keeps the in-memory theme when private browsing blocks reads or writes', () => {
  for (const options of [{ blocked: true }, { saved: 'light', readOnly: true }]) {
    const page = browser(options); page.run(); if (options.saved === 'light') page.click();
    page.navigate(); page.emit('window', 'pageshow'); page.navigate();
    assert.equal(page.document.documentElement.dataset.theme, 'dark');
    assert.equal(page.button.attributes['aria-checked'], 'true');
  }
});

test('a legacy cached theme listener cannot double-toggle one click during a deployment', () => {
  const page = browser({ saved: 'light' }); let legacyCalls = 0;
  page.listeners.set('document:click', [{ capture: false, callback: () => { legacyCalls++; } }]);
  page.run(); page.navigate(); page.click();
  assert.equal(page.document.documentElement.dataset.theme, 'dark');
  assert.equal(legacyCalls, 0);
});

test('first visits, invalid preferences and cleared storage default to dark', () => {
  assert.match(layout, /<html lang="en" data-theme="dark">/);
  for (const options of [{}, { saved: 'invalid' }, { blocked: true }]) {
    const page = browser(options); page.run(); page.navigate();
    assert.equal(page.document.documentElement.dataset.theme, 'dark');
    assert.equal(page.button.attributes['aria-checked'], 'true');
  }
  const page = browser({ saved: 'light' }); page.run();
  page.emit('window', 'storage', { key: 'fisch-finder-theme', newValue: null });
  assert.equal(page.document.documentElement.dataset.theme, 'dark');
});
