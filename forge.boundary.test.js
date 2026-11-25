// Boundary checks for forge.js (R25): the exact edges of the limits, the share-link format and
// the shape of decoded links. Each one fails if its limit or check is moved.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lint, encodeSpec, decodeSpec, overLimit, MAX_PART } from './forge.js';

const tokenTip = (spec) => lint(spec).some((i) => /Over about 6,000 tokens/.test(i.msg));

test('token tip starts above 6000 tokens: 24000 characters is not flagged, 24001 is', () => {
  // The prompt is "<task>\n" + text + "\n</task>" = text + 15 characters, and tokens are ceil(chars / 4).
  assert.equal(tokenTip({ task: 'x'.repeat(24000 - 15) }), false);
  assert.equal(tokenTip({ task: 'x'.repeat(24001 - 15) }), true);
});

test('a link is "z1." plus base64url, with no padding and no other characters', async () => {
  for (let n = 0; n < 12; n++) {
    const link = await encodeSpec({ task: 'a'.repeat(n) });
    assert.match(link, /^z1\.[A-Za-z0-9_-]*$/, `length ${n}: ${link}`);
  }
});

test('a decoded link that is not an object is not a prompt (null, not an empty form)', async () => {
  const b64 = (s) => Buffer.from(s).toString('base64url');
  assert.equal(await decodeSpec(b64('null')), null);
  assert.equal(await decodeSpec(b64('42')), null);
  assert.equal(await decodeSpec(b64('[1, 2]')), null);
});

test('overLimit flags a part only above MAX_PART characters', () => {
  assert.deepEqual(overLimit({ task: 'x'.repeat(MAX_PART) }), []);
  assert.deepEqual(overLimit({ task: 'x'.repeat(MAX_PART + 1) }), ['Task']);
});
