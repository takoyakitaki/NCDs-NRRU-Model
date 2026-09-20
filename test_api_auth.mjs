// The API routes are only as safe as this: a request with no credential,
// or a forged one, must not authenticate. verifyIdToken fails closed — it
// returns null on a bad token AND on any network/parse error.
//   run: node test_api_auth.mjs
import assert from 'node:assert/strict';
import { bearerToken, verifyIdToken } from './api/_auth.js';

// header parsing
assert.equal(bearerToken({ headers: {} }), '', 'missing header must yield no token');
assert.equal(bearerToken({ headers: { authorization: '' } }), '', 'empty header must yield no token');
assert.equal(bearerToken({ headers: { authorization: 'abc' } }), '', 'a bare value is not a Bearer token');
assert.equal(bearerToken({ headers: { authorization: 'Basic abc' } }), '', 'Basic auth is not a Bearer token');
assert.equal(bearerToken({ headers: { authorization: 'Bearer  tok  ' } }), 'tok', 'Bearer token is trimmed');

// no credential -> no uid, without touching the network
assert.equal(await verifyIdToken(''), null, 'empty token must not authenticate');
assert.equal(await verifyIdToken(undefined), null, 'absent token must not authenticate');

// a forged token must not authenticate; if the network is unavailable the
// helper still returns null, which is the outcome we require either way
const forged = 'eyJhbGciOiJub25lIn0.eyJzdWIiOiJhZG1pbiJ9.';
assert.equal(await verifyIdToken(forged), null, 'forged token must not authenticate');

console.log('ok — api/_auth.js rejects missing, malformed and forged credentials');
