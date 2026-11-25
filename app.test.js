// Behaviour checks for app.js (R25). The page code runs in Node against a small fake DOM, so it
// needs no dependency: the stubs below cover only the calls app.js makes. The test order matters,
// because app.js keeps its state in module variables and the library in fake localStorage.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const elements = [];
function makeEl(tag = 'div', props = {}) {
  const listeners = {};
  const node = {
    tagName: tag.toUpperCase(), children: [], dataset: {}, attrs: {}, listeners,
    value: '', textContent: '', hidden: false, checked: false, files: [], className: '', id: '',
    append(...kids) { this.children.push(...kids); },
    replaceChildren(...kids) { this.children = [...kids]; },
    setAttribute(k, v) { this.attrs[k] = String(v); },
    addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
    click() { for (const f of listeners.click || []) f({ target: this }); },
    dispatch(type, ev = {}) { for (const f of listeners[type] || []) f({ target: this, ...ev }); },
  };
  Object.assign(node, props);
  elements.push(node);
  return node;
}
const radios = { tags: makeEl('input', { checked: true }), markdown: makeEl('input') };
radios.tags.attrs.value = 'tags'; radios.markdown.attrs.value = 'markdown';
radios.tags.attrs.name = 'style'; radios.markdown.attrs.name = 'style';

globalThis.document = {
  createElement: (tag) => makeEl(tag),
  querySelector(sel) {
    if (sel === 'input[name=style]:checked') return radios.markdown.checked ? radios.markdown : radios.tags;
    const m = sel.match(/^input\[name=style\]\[value=(\w+)\]$/);
    if (m) return radios[m[1]];
    if (sel.startsWith('#')) return elements.find((e) => e.id === sel.slice(1)) ?? makeEl('div', { id: sel.slice(1) });
    throw new Error(`unexpected selector ${sel}`);
  },
  querySelectorAll(sel) {
    if (sel === 'input[name=style]') return [radios.tags, radios.markdown];
    if (sel === '#form textarea') return elements.filter((e) => e.tagName === 'TEXTAREA' && e.dataset.key);
    throw new Error(`unexpected selector ${sel}`);
  },
};
const storage = new Map();
Object.defineProperty(globalThis, 'localStorage', { value: { getItem: (k) => (storage.has(k) ? storage.get(k) : null), setItem: (k, v) => storage.set(k, String(v)) }, configurable: true });
Object.defineProperty(globalThis, 'history', { value: { replaceState() {} }, configurable: true });
globalThis.confirm = () => true;
Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { writeText: async () => {} } }, configurable: true });
globalThis.URL.createObjectURL = () => 'blob:test';
globalThis.URL.revokeObjectURL = () => {};
const { encodeSpec } = await import('./forge.js');
Object.defineProperty(globalThis, 'location', { value: { hash: `#p=${await encodeSpec({ task: 'Shared task text for the test' })}`, origin: 'http://x', pathname: '/' }, configurable: true });
await import('./app.js');

const el$ = (id) => document.querySelector('#' + id);
const field = (key) => el$('f-' + key);
const status = () => el$('status').textContent;
const library = () => JSON.parse(storage.get('promptforge.library') ?? '[]');
const fire = (id, type, ev) => el$(id).dispatch(type, ev);
const importFile = async (json) => {
  const text = typeof json === 'string' ? json : JSON.stringify(json);
  await fire('import', 'change', { target: Object.assign(el$('import'), { files: [{ size: text.length, text: async () => text }] }) });
  await new Promise((r) => setTimeout(r, 0));
};

test('a shared link in the address bar fills the form when the page opens', () => {
  assert.equal(field('task').value, 'Shared task text for the test');
  assert.equal(status(), 'Loaded a shared prompt.');
});

test('saving twice under the same name keeps one library entry', () => {
  field('task').value = 'Summarise the report below for my manager.';
  el$('save').click();
  el$('save').click();
  assert.equal(library().filter((p) => p.name === 'Summarise the report below for my manager.').length, 1);
});

test('split: pasted text with parts fills the form; text without parts goes into Task', () => {
  el$('paste').value = '<task>\nList three risks of this plan.\n</task>\n\n<output_format>\nA numbered list.\n</output_format>';
  el$('split').click();
  assert.equal(field('task').value, 'List three risks of this plan.');
  assert.equal(field('format').value, 'A numbered list.');
  el$('paste').value = 'Just a plain sentence with no parts.';
  el$('split').click();
  assert.equal(field('task').value, 'Just a plain sentence with no parts.');
  assert.equal(status(), 'No parts found, so the whole text went into Task.');
});

test('importing a file with the same name twice keeps one entry for that name', async () => {
  await importFile([
    { name: 'Weekly update', spec: { task: 'First version of the update.' }, style: 'tags', saved: '2026-11-01T10:00:00Z' },
    { name: 'Weekly update', spec: { task: 'Second version of the update.' }, style: 'tags', saved: '2026-11-02T10:00:00Z' },
  ]);
  const named = library().filter((p) => p.name === 'Weekly update');
  assert.equal(named.length, 1, 'duplicate names in one file must not both be kept');
  assert.equal(named[0].spec.task, 'Second version of the update.', 'the later entry in the file wins');
});

test('importing something that is not a library export says so and keeps the library', async () => {
  const before = JSON.stringify(library());
  await importFile({ not: 'a library' });
  assert.equal(status(), 'That file is not a PromptForge library export.');
  assert.equal(JSON.stringify(library()), before);
});
