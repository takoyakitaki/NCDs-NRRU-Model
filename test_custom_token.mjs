// A custom token is just an RS256 JWT with an exact claim set — get one field
// wrong and signInWithCustomToken() fails for every user at once. This signs
// one with a throwaway key and checks the signature and the claims.
//   run: node test_custom_token.mjs
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });

process.env.FIREBASE_CLIENT_EMAIL = 'svc@ncds-nrru-model.iam.gserviceaccount.com';
process.env.FIREBASE_PRIVATE_KEY = privateKey.export({ type: 'pkcs8', format: 'pem' });

const { firebaseCustomToken } = await import('./api/line-auth.js');

const token = firebaseCustomToken('line_U0123456789');
const [header, payload, signature] = token.split('.');
assert.equal(token.split('.').length, 3, 'a JWT has three parts');

// the signature must actually verify against the key that signed it
const ok = crypto
  .createVerify('RSA-SHA256')
  .update(`${header}.${payload}`)
  .verify(publicKey, Buffer.from(signature, 'base64url'));
assert.ok(ok, 'signature must verify with the signing key');

assert.deepEqual(JSON.parse(Buffer.from(header, 'base64url')), { alg: 'RS256', typ: 'JWT' });

const claims = JSON.parse(Buffer.from(payload, 'base64url'));
assert.equal(claims.uid, 'line_U0123456789', 'uid is what the client signs in as');
assert.equal(claims.iss, process.env.FIREBASE_CLIENT_EMAIL);
assert.equal(claims.sub, process.env.FIREBASE_CLIENT_EMAIL, 'iss and sub must both be the service account');
assert.equal(
  claims.aud,
  'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit',
  'wrong audience -> Firebase rejects the token'
);
assert.ok(claims.exp > claims.iat, 'must not be pre-expired');
assert.ok(claims.exp - claims.iat <= 3600, 'Firebase caps custom tokens at one hour');

console.log('ok — api/line-auth.js mints a valid Firebase custom token');
