import { FIELDS, assemble, findVars, fillVars, estimateTokens, lint, score, encodeSpec, decodeSpec, pickSpec, TEMPLATES } from './forge.js';

const $ = (s) => document.querySelector(s);
const LIB = 'promptforge.library';
const DRAFT = 'promptforge.draft';
let values = {};
let varNames = null;

// Storage can throw (private window, blocked site data); the page still works without it.
const store = {
  get(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; } },
};

// All text goes in through textContent/value, never innerHTML.
const el = (tag, props = {}, ...kids) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...kids);
  return node;
};

for (const f of FIELDS) {
  const id = `f-${f.key}`;
  const box = el('textarea', { id, rows: ['context', 'input', 'examples', 'constraints'].includes(f.key) ? 4 : 2 });
  box.dataset.key = f.key;
  box.setAttribute('aria-describedby', `${id}-hint`);
  $('#form').append(el('div', { className: 'field' },
    el('label', { htmlFor: id, textContent: f.label }),
    el('small', { id: `${id}-hint`, textContent: f.hint }),
    box));
}
TEMPLATES.forEach((t, i) => $('#template').append(el('option', { value: String(i), textContent: t.name })));

const boxes = () => [...document.querySelectorAll('#form textarea')];
const getSpec = () => Object.fromEntries(boxes().map((b) => [b.dataset.key, b.value]));
const setSpec = (spec) => boxes().forEach((b) => { b.value = spec[b.dataset.key] ?? ''; });
const getStyle = () => document.querySelector('input[name=style]:checked').value;
const setStyle = (style) => { document.querySelector(`input[name=style][value=${style === 'markdown' ? 'markdown' : 'tags'}]`).checked = true; };
const isEmpty = () => boxes().every((b) => !b.value.trim());
const finalPrompt = () => fillVars(assemble(getSpec(), getStyle()), values);
const textValues = (raw) => Object.fromEntries(Object.entries(raw && typeof raw === 'object' ? raw : {}).filter(([, v]) => typeof v === 'string'));

let statusTimer;
function say(msg) {
  $('#status').textContent = msg;
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => { $('#status').textContent = ''; }, 5000);
}

// Rebuilt only when the set of variables changes, so typing in a variable box keeps focus.
function renderVars(names) {
  if (names.join('\n') === varNames) return;
  varNames = names.join('\n');
  $('#vars-card').hidden = !names.length;
  $('#vars').replaceChildren(...names.map((name) => {
    const box = el('textarea', { id: `v-${name}`, rows: 2, value: values[name] ?? '' });
    box.dataset.var = name;
    return el('div', {}, el('label', { htmlFor: box.id, textContent: `{{${name}}}` }), box);
  }));
}

function render() {
  const spec = getSpec();
  const prompt = assemble(spec, getStyle());
  const final = fillVars(prompt, values);
  renderVars(findVars(prompt));
  $('#preview').textContent = final || 'Your prompt appears here as you fill in the parts.';
  $('#tokens').textContent = `About ${estimateTokens(final).toLocaleString()} tokens`;
  $('#chars').textContent = `${final.length.toLocaleString()} characters`;
  const issues = lint(spec, values);
  $('#score').textContent = score(issues);
  $('#issues').replaceChildren(...(issues.length
    ? issues.map((i) => el('li', { className: i.level, textContent: i.msg }))
    : [el('li', { className: 'ok', textContent: 'Nothing to fix. This prompt covers the basics.' })]));
  store.set(DRAFT, { spec, style: getStyle(), values });
}

$('#form').addEventListener('input', render);
document.querySelectorAll('input[name=style]').forEach((r) => r.addEventListener('change', render));
$('#vars').addEventListener('input', (e) => { values[e.target.dataset.var] = e.target.value; render(); });

$('#template').addEventListener('change', (e) => {
  const t = TEMPLATES[e.target.value];
  e.target.value = '';
  if (!t || (!isEmpty() && !confirm(`Replace what you typed with "${t.name}"?`))) return;
  setSpec(pickSpec(t.spec));
  values = {};
  render();
  say(`Loaded "${t.name}". Fill in the variables.`);
});

$('#clear').addEventListener('click', () => {
  if (!isEmpty() && !confirm('Clear every field?')) return;
  setSpec({});
  values = {};
  $('#save-name').value = '';
  history.replaceState(null, '', location.pathname);
  render();
});

async function copy(text, done) {
  try {
    await navigator.clipboard.writeText(text);
    say(done);
  } catch {
    say('This browser blocked copying. Select the text and copy it yourself.');
  }
}

function download(name, text, type) {
  const a = el('a', { href: URL.createObjectURL(new Blob([text], { type })), download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

const fileName = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'prompt';

$('#copy').addEventListener('click', () => (isEmpty() ? say('Nothing to copy yet.') : copy(finalPrompt(), 'Prompt copied.')));

$('#download').addEventListener('click', () => {
  if (isEmpty()) return say('Nothing to download yet.');
  download(`${fileName($('#save-name').value || getSpec().task)}.md`, `${finalPrompt()}\n`, 'text/markdown');
});

$('#share').addEventListener('click', async () => {
  if (isEmpty()) return say('Fill in a part first.');
  const url = `${location.origin}${location.pathname}#p=${await encodeSpec(getSpec())}`;
  history.replaceState(null, '', url);
  copy(url, url.length > 8000
    ? `Link copied (${url.length} characters). It is long, so some chat apps may cut it.`
    : `Share link copied (${url.length} characters). Variable values are not in the link.`);
});

// Library: [{ name, spec, style, saved }] in this browser only.
function library() {
  const lib = store.get(LIB, []);
  return Array.isArray(lib) ? lib.filter((p) => p && typeof p.name === 'string') : [];
}

function saveLib(lib) {
  const ok = store.set(LIB, lib);
  if (!ok) say('Could not save: browser storage is full or blocked.');
  renderLib();
  return ok;
}

function loadPrompt(p) {
  if (!isEmpty() && !confirm(`Replace what you typed with "${p.name}"?`)) return;
  setSpec(pickSpec(p.spec));
  setStyle(p.style);
  $('#save-name').value = p.name;
  values = {};
  render();
  say(`Loaded "${p.name}".`);
}

function deletePrompt(i) {
  const lib = library();
  if (!confirm(`Delete "${lib[i].name}" from your library?`)) return;
  lib.splice(i, 1);
  saveLib(lib);
}

function renderLib() {
  const lib = library();
  $('#lib-empty').hidden = lib.length > 0;
  $('#lib').replaceChildren(...lib.map((p, i) => el('li', {},
    el('span', { textContent: p.name, title: p.name }),
    el('small', { textContent: new Date(p.saved).toLocaleDateString() }),
    el('button', { textContent: 'Load', ariaLabel: `Load ${p.name}`, onclick: () => loadPrompt(p) }),
    el('button', { textContent: 'Delete', ariaLabel: `Delete ${p.name}`, onclick: () => deletePrompt(i) }))));
}

$('#save').addEventListener('click', () => {
  if (isEmpty()) return say('Fill in a part first.');
  const spec = getSpec();
  const name = ($('#save-name').value.trim() || spec.task.trim().slice(0, 60) || 'Untitled prompt').slice(0, 80);
  $('#save-name').value = name;
  const lib = [{ name, spec, style: getStyle(), saved: new Date().toISOString() }, ...library().filter((p) => p.name !== name)];
  if (saveLib(lib)) say(`Saved "${name}".`);
});

$('#export').addEventListener('click', () => {
  const lib = library();
  if (!lib.length) return say('Your library is empty.');
  download('promptforge-library.json', JSON.stringify(lib, null, 2), 'application/json');
});

$('#import-btn').addEventListener('click', () => $('#import').click());
$('#import').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    if (file.size > 2_000_000) throw new Error('too big');
    const raw = JSON.parse(await file.text());
    // Imported files are untrusted: keep only names, known text fields and a valid date.
    const items = (Array.isArray(raw) ? raw : [])
      .filter((p) => p && typeof p.name === 'string' && p.name.trim())
      .map((p) => ({
        name: p.name.trim().slice(0, 80),
        spec: pickSpec(p.spec),
        style: p.style === 'markdown' ? 'markdown' : 'tags',
        saved: new Date(Number.isNaN(Date.parse(p.saved)) ? Date.now() : p.saved).toISOString(),
      }));
    if (!items.length) throw new Error('empty');
    const names = new Set(items.map((p) => p.name));
    if (saveLib([...items, ...library().filter((p) => !names.has(p.name))])) {
      say(`Imported ${items.length} prompt${items.length === 1 ? '' : 's'}.`);
    }
  } catch {
    say('That file is not a PromptForge library export.');
  }
});

if (location.hash.startsWith('#p=')) {
  const shared = await decodeSpec(location.hash.slice(3));
  if (shared) {
    setSpec(shared);
    say('Loaded a shared prompt.');
  } else {
    say('That share link is broken.');
  }
} else {
  const draft = store.get(DRAFT, null);
  if (draft) {
    setSpec(pickSpec(draft.spec));
    setStyle(draft.style);
    values = textValues(draft.values);
  }
}
renderLib();
render();
