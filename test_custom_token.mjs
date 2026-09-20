// A custom token is just an RS256 JWT with an exact claim set — get one field
// wrong and signInWithCustomToken() fails for every user at once. This signs
// one with a throwaway key and checks the signature and the claims.
//
// It runs twice, because Vercel can hand the key over in either shape: as the
// service-account JSON spells it (backslash-n as two characters) or with real
// newlines. Only the escaped shape catches a broken unescape, and that is the
// shape the JSON actually gives you.
//
//   run: node test_custom_token.mjs
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const pem = privateKey.export({ type: 'pkcs8', format: 'pem' });
const escaped = pem.replace(/\r?\n/g, String.raw`\n`);

assert.ok(escaped.includes(String.raw`\n`), 'the escaped form must contain literal backslash-n');
assert.ok(!escaped.includes('\n'), 'the escaped form must contain no real newlines');

process.env.FIREBASE_CLIENT_EMAIL = 'svc@ncds-nrru-model.iam.gserviceaccount.com';

let run = 0;
for (const [shape, value] of [['escaped (what Vercel holds)', escaped], ['real newlines', pem]]) {
  process.env.FIREBASE_PRIVATE_KEY = value;

  // the module reads the key once at import, so each shape needs a fresh copy
  const { firebaseCustomToken } = await import(`./api/line-auth.js?case=${run++}`);

  const token = firebaseCustomToken('line_U0123456789');
  const [header, payload, signature] = token.split('.');
  assert.equal(token.split('.').length, 3, `${shape}: a JWT has three parts`);

  const ok = crypto
    .createVerify('RSA-SHA256')
    .update(`${header}.${payload}`)
    .verify(publicKey, Buffer.from(signature, 'base64url'));
  assert.ok(ok, `${shape}: signature must verify with the signing key`);

  assert.deepEqual(JSON.parse(Buffer.from(header, 'base64url')), { alg: 'RS256', typ: 'JWT' });

  const claims = JSON.parse(Buffer.from(payload, 'base64url'));
  assert.equal(claims.uid, 'line_U0123456789', `${shape}: uid is what the client signs in as`);
  assert.equal(claims.iss, process.env.FIREBASE_CLIENT_EMAIL, `${shape}: iss`);
  assert.equal(claims.sub, process.env.FIREBASE_CLIENT_EMAIL, `${shape}: iss and sub are both the service account`);
  assert.equal(
    claims.aud,
    'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit',
    `${shape}: wrong audience -> Firebase rejects the token`
  );
  assert.ok(claims.exp > claims.iat, `${shape}: must not be pre-expired`);
  assert.ok(claims.exp - claims.iat <= 3600, `${shape}: Firebase caps custom tokens at one hour`);
}

console.log('ok — api/line-auth.js mints a valid Firebase custom token from either key shape');
