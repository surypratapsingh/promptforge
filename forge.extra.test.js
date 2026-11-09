import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  assemble, findVars, fillVars, estimateTokens, lint, score, encodeSpec, decodeSpec, pickSpec,
  importPrompt, TEMPLATES,
} from './forge.js';

describe('assemble', () => {
  it('handles empty and very long input', () => {
    assert.equal(assemble({ role: '', task: '', format: '' }), '');
    const huge = { role: 'editor', task: 'Do it.', constraints: '#'.repeat(20000), format: 'x' };
    const out = assemble(huge);
    assert.ok(out.length > 20000);
  });

  it('handles Unicode and Hindi input', () => {
    const out = assemble({ role: 'नमस्ते अनुवादक', task: 'सारांश लिखो', format: 'मुक्त-प/response' });
    assert.ok(out.includes('नमस्ते अनुवादक'));
    assert.ok(out.includes('सारांश लिखो'));
  });

  it('handles unexpected types', () => {
    assert.equal(assemble(undefined), '');
    assert.equal(assemble(null), '');
    assert.equal(assemble(42), '');
  });

  it('keeps role starting with "You are"', () => {
    const out = assemble({ role: 'You are a tutor.' });
    assert.equal(out, 'You are a tutor.');
    const withTask = assemble({ role: 'You are a tutor.', task: 'Do it.' });
    assert.ok(withTask.includes('Do it.'));
  });

  it('handles empty and unexpected types', () => {
    assert.equal(assemble(undefined), '');
    assert.equal(assemble(null), '');
    assert.equal(assemble(42), '');
    assert.equal(assemble({}), '');
  });
});

describe('findVars', () => {
  it('finds variables', () => {
    assert.deepEqual(findVars('Hi {{name}}, see {{ topic }} and {{name}} again. {{1bad}}'), ['name', 'topic']);
    assert.deepEqual(findVars(''), []);
    assert.deepEqual(findVars(undefined), []);
    assert.deepEqual(findVars(null), []);
    assert.deepEqual(findVars('{{a}}'), ['a']);
  });
});

describe('fillVars', () => {
  it('fills and leaves unfilled', () => {
    assert.equal(fillVars('{{a}} and {{b}}', { a: 'x', b: '  ' }), 'x and {{b}}');
    assert.equal(fillVars('', { a: 'x' }), '');
    assert.equal(fillVars(undefined, { a: 'x' }), '');
    assert.equal(fillVars(null, { a: 'x' }), '');
    assert.equal(fillVars('{{constructor}}', {}), '{{constructor}}');
  });
});

describe('estimateTokens', () => {
  it('estimates tokens', () => {
    assert.equal(estimateTokens('a'.repeat(400)), 100);
    assert.equal(estimateTokens(''), 0);
    assert.equal(estimateTokens(undefined), 0);
    assert.equal(estimateTokens(null), 0);
  });
});

describe('lint', () => {
  it('handles empty spec', () => {
    const issues = lint({});
    assert.ok(issues.some((i) => i.level === 'fix' && /task/.test(i.msg)));
    assert.ok(issues.some((i) => /look like/.test(i.msg)));
    assert.ok(issues.some((i) => /size/.test(i.msg)));
  });

  it('handles Unicode and Hindi task', () => {
    const issues = lint({ task: 'नमस्ते — सारांश लिखो', format: 'बुलेट बिंदु' });
    assert.ok(issues.length >= 0);
  });

  it('handles unexpected types', () => {
    const issues = lint(undefined);
    assert.equal(issues.length, 3);
    assert.ok(issues.some((i) => /task/.test(i.msg)));
    assert.ok(issues.some((i) => /look like/.test(i.msg)));
    assert.ok(issues.some((i) => /size/.test(i.msg)));
    assert.equal(lint(null).length, 3);
    assert.equal(lint(42).length, 3);
  });
});

describe('score', () => {
  it('scores issues', () => {
    assert.equal(score([]), 100);
    assert.equal(score([{ level: 'fix' }, { level: 'tip' }]), 67);
    assert.equal(score([{ level: 'fix' }, { level: 'fix' }, { level: 'fix' }, { level: 'fix' }]), 0);
    assert.equal(score([{ level: 'tip' }]), 92);
    assert.equal(score(undefined), 100);
    assert.equal(score(null), 100);
  });
});

describe('encodeSpec / decodeSpec', () => {
  it('round-trips Unicode and Hindi', () => {
    const spec = { task: 'नमस्ते — summarise ✓', role: 'tutor', context: 'कुछ संदर्भ' };
    const back = decodeSpec(encodeSpec(spec));
    assert.equal(back.task, spec.task);
    assert.equal(back.role, 'tutor');
    assert.equal(back.context, 'कुछ संदर्भ');
    assert.equal(back.evil, undefined);
  });

  it('drops unknown fields', () => {
    const spec = { task: 'Hello', evil: '<script>' };
    const back = decodeSpec(encodeSpec(spec));
    assert.equal(back.task, 'Hello');
    assert.equal(back.evil, undefined);
  });

  it('returns null on garbage input', () => {
    assert.equal(decodeSpec('%%%not-base64'), null);
    assert.equal(decodeSpec(''), null);
    assert.equal(decodeSpec(undefined), null);
  });
});

describe('pickSpec', () => {
  it('keeps only known text fields, mapping every field to a string', () => {
    const raw = {
      role: 'tutor',
      task: 'Do it.',
      evil: '<script>',
      notAField: 123,
      roleCopy: 'tutor2',
    };
    const out = pickSpec(raw);
    assert.deepEqual(Object.keys(out).sort(), ['constraints', 'context', 'examples', 'format', 'input', 'role', 'task', 'tone']);
    assert.equal(out.role, 'tutor');
    assert.equal(out.task, 'Do it.');
    assert.equal(out.evil, undefined);
    assert.equal(out.notAField, undefined);
    assert.equal(out.roleCopy, undefined);
  });

  it('handles null and undefined', () => {
    assert.deepEqual(pickSpec(null), { role: '', context: '', task: '', input: '', examples: '', constraints: '', format: '', tone: '' });
    assert.deepEqual(pickSpec(undefined), { role: '', context: '', task: '', input: '', examples: '', constraints: '', format: '', tone: '' });
    assert.deepEqual(pickSpec(42), { role: '', context: '', task: '', input: '', examples: '', constraints: '', format: '', tone: '' });
  });

  it('empty object yields empty strings', () => {
    assert.deepEqual(pickSpec({}), { role: '', context: '', task: '', input: '', examples: '', constraints: '', format: '', tone: '' });
  });
});

describe('empty and very long input (R9 item 14)', () => {
  it('a very long prompt still gives a score in 0-100 and the token tip', () => {
    const spec = { task: 'Summarise the text below.', input: 'word '.repeat(200000), format: '5 bullets' };
    const issues = lint(spec, { });
    assert.ok(issues.some((i) => /Over about 6,000 tokens/.test(i.msg)));
    const s = score(issues);
    assert.ok(Number.isInteger(s) && s >= 0 && s <= 100);
  });

  it('an empty spec gives a fix-level task message and a score in range', () => {
    const issues = lint({});
    assert.ok(issues.some((i) => i.level === 'fix' && /Add a task/.test(i.msg)));
    assert.equal(score(issues) >= 0 && score(issues) <= 100, true);
  });
});

describe('score floor (FIX b75f8d7)', () => {
  it('stays at 0 when fix issues cost more than 100 points', () => {
    const issues = Array.from({ length: 5 }, () => ({ level: 'fix', msg: 'x' }));
    assert.equal(score(issues), 0);
  });
});

describe('importPrompt (inverse of assemble)', () => {
  const spec = {
    role: 'a senior Python reviewer', context: 'Team of five, Python 3.12.', task: 'Review the diff below for bugs.',
    input: '{{diff}}', examples: 'Input: x = 1\nOutput: none', constraints: 'Keep it short\n- Name the file', format: 'Bullet list', tone: 'Direct.',
  };

  it('rebuilds the same text for every template, in both styles', () => {
    for (const style of ['tags', 'markdown']) {
      for (const t of TEMPLATES) {
        const text = assemble(t.spec, style);
        assert.equal(assemble(importPrompt(text), style), text, `${t.name} (${style})`);
      }
    }
  });

  it('round-trips a full spec with a multi-line rule list and a variable', () => {
    for (const style of ['tags', 'markdown']) {
      const text = assemble(spec, style);
      const back = importPrompt(text);
      assert.equal(assemble(back, style), text);
      assert.equal(back.task, spec.task);
      assert.equal(back.input, '{{diff}}');
    }
  });

  it('keeps a markdown-style value that contains a non-part heading', () => {
    const s2 = { task: 'Summarise the notes.', input: 'Intro\n## Notes\nkept line' };
    const text = assemble(s2, 'markdown');
    assert.equal(importPrompt(text).input, s2.input);
    assert.equal(assemble(importPrompt(text), 'markdown'), text);
  });

  it('returns null when no part is recognised, so the caller can fall back', () => {
    assert.equal(importPrompt('Just some plain text with no parts.'), null);
    assert.equal(importPrompt(''), null);
    assert.equal(importPrompt(undefined), null);
    assert.equal(importPrompt('<unknown>\nx\n</unknown>'), null);
  });
});
