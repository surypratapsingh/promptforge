import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assemble, findVars, fillVars, estimateTokens, lint, score, encodeSpec, decodeSpec, TEMPLATES } from './forge.js';

test('assemble builds tagged sections in a fixed order and skips empty fields', () => {
  const out = assemble({ role: 'A careful editor.', task: 'Fix typos.', constraints: '- Keep meaning\n\n* British spelling', format: '' });
  assert.equal(out, 'You are a careful editor.\n\n<task>\nFix typos.\n</task>\n\n<rules>\n- Keep meaning\n- British spelling\n</rules>');
});

test('assemble supports markdown headings and keeps a role that starts with "You are"', () => {
  const out = assemble({ role: 'You are a tutor.', context: 'Exam tomorrow.', task: 'Explain DNS.' }, 'markdown');
  assert.equal(out, 'You are a tutor.\n\n## Context\nExam tomorrow.\n\n## Task\nExplain DNS.');
});

test('findVars returns each variable once, in order', () => {
  assert.deepEqual(findVars('Hi {{name}}, see {{ topic }} and {{name}} again. {{1bad}}'), ['name', 'topic']);
});

test('fillVars replaces filled variables and leaves empty ones', () => {
  assert.equal(fillVars('{{a}} and {{b}}', { a: 'x', b: '  ' }), 'x and {{b}}');
  assert.equal(fillVars('{{constructor}}', {}), '{{constructor}}');
});

test('estimateTokens is about four characters per token', () => {
  assert.equal(estimateTokens('a'.repeat(400)), 100);
});

test('lint flags a missing task and unfilled variables as fixes', () => {
  const issues = lint({ input: '{{doc}}' });
  assert.ok(issues.some((i) => i.level === 'fix' && /task/.test(i.msg)));
  assert.ok(issues.some((i) => i.level === 'fix' && /\{\{doc\}\}/.test(i.msg)));
  assert.ok(!lint({ task: 'Summarise the document below for me.', input: '{{doc}}' }, { doc: 'text' }).some((i) => /Fill in/.test(i.msg)));
});

test('lint gives tips for vague words, capitals, JSON without example and negative-only rules', () => {
  const msgs = lint({
    task: 'Write some good tips about stuff etc.',
    constraints: "Don't ramble\nNEVER use jargon",
    format: 'JSON list',
  }).map((i) => i.msg).join('\n');
  assert.match(msgs, /Vague words: some, good, stuff, etc/);
  assert.match(msgs, /Capitals \(NEVER\)/);
  assert.match(msgs, /Add an example/);
  assert.match(msgs, /Say what to do instead/);
  assert.match(msgs, /Give a size/);
});

test('a complete template passes with a high score', () => {
  const t = TEMPLATES[0];
  const issues = lint(t.spec, { article: 'Some article text.' });
  assert.deepEqual(issues, []);
  assert.equal(score(issues), 100);
  assert.equal(score([{ level: 'fix' }, { level: 'tip' }]), 67);
});

test('every template has a task and a format', () => {
  for (const t of TEMPLATES) assert.ok(t.spec.task && t.spec.format, t.name);
});

test('share links round-trip Unicode and drop unknown fields', async () => {
  const spec = { task: 'नमस्ते — summarise ✓', role: 'tutor', evil: '<script>' };
  const back = await decodeSpec(await encodeSpec(spec));
  assert.equal(back.task, spec.task);
  assert.equal(back.role, 'tutor');
  assert.equal(back.evil, undefined);
  assert.equal(back.context, '');
  assert.equal(await decodeSpec('%%%not-base64'), null);
});

test('lint warns only when the prompt is over about 6,000 tokens', () => {
  const big = { task: 'Summarise the text below for a reader.', input: 'word '.repeat(5000), format: '5 bullets, 20 words each' };
  assert.match(lint(big).map((i) => i.msg).join('\n'), /Over about 6,000 tokens/);
  assert.doesNotMatch(lint({ task: 'Summarise the text below.', format: '5 bullets' }).map((i) => i.msg).join('\n'), /Over about 6,000/);
});
