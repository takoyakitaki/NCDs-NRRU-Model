// FIREBASE_PRIVATE_KEY arrives from a dashboard field, and what comes out the
// other side depends on how it was pasted. Every shape below has been seen in
// the wild; all of them must produce a key node:crypto can sign with, because
// a bad one takes down sign-in for everyone at once.
//   run: node test_pem_shapes.mjs
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { normalizePem } from './api/line-auth.js';

const pem = crypto
  .generateKeyPairSync('rsa', { modulusLength: 2048 })
  .privateKey.export({ type: 'pkcs8', format: 'pem' });

const BS = String.fromCharCode(92); // a lone backslash, unambiguously
const body = pem
  .replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----/g, '')
  .replace(/\s/g, '');

const shapes = {
  'real newlines (pasted as multiline)': pem,
  'escaped newlines (copied from the JSON)': pem.replace(/\n/g, `${BS}n`),
  'escaped, with the JSON quotes left on': `"${pem.replace(/\n/g, `${BS}n`)}"`,
  'windows line endings': pem.replace(/\n/g, '\r\n'),
  'escaped windows line endings': pem.replace(/\n/g, `${BS}r${BS}n`),
  'newlines stripped by the input field': `-----BEGIN PRIVATE KEY-----${body}-----END PRIVATE KEY-----`,
  'spaces where the newlines were': `-----BEGIN PRIVATE KEY----- ${body} -----END PRIVATE KEY-----`,
  'surrounding whitespace': `\n  ${pem}  \n`,
};

for (const [shape, value] of Object.entries(shapes)) {
  const normalized = normalizePem(value);

  // the real test: can node actually sign with it
  const key = crypto.createPrivateKey(normalized);
  const sig = crypto.createSign('RSA-SHA256').update('payload').sign(key);
  assert.ok(sig.length > 0, `${shape}: produced no signature`);

  assert.ok(normalized.startsWith('-----BEGIN PRIVATE KEY-----\n'), `${shape}: bad header`);
  assert.ok(normalized.endsWith('-----END PRIVATE KEY-----\n'), `${shape}: bad footer`);
}

// Garbage must stay garbage rather than be silently "repaired" into something
// that looks valid — the caller needs the DECODER error to know what happened.
assert.throws(() => crypto.createPrivateKey(normalizePem('not a key at all')));
assert.throws(() => crypto.createPrivateKey(normalizePem('')));

console.log(`ok — normalizePem handles all ${Object.keys(shapes).length} key shapes, and still rejects junk`);
