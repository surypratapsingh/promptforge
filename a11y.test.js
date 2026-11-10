import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const read = (name) => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');

// Keyboard and screen-reader pass (FB-CI R8 item 3). app.js and index.html are DOM code with no
// dependencies, so the source is what a zero-dependency test can check.
test('prompt check findings say Fix/Tip in text, not only in the CSS prefix', () => {
  const src = read('app.js');
  assert.match(src, /className: 'sr-only'/);
  assert.match(src, /i\.level === 'fix' \? 'Fix: ' : 'Tip: '/);
  assert.match(read('index.html'), /\.sr-only \{/);
});

test('the prompt check and library lists are named for screen readers', () => {
  const html = read('index.html');
  assert.match(html, /<ul class="issues" id="issues" role="list" aria-label="Prompt check results"><\/ul>/);
  assert.match(html, /<ul class="lib" id="lib" role="list" aria-label="Saved prompts"><\/ul>/);
});
