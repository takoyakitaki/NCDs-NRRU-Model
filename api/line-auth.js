// ============================================================
// api/line-auth.js  –  LINE login -> Firebase custom token
//
// Replaces signInAnonymously(). Anonymous sign-in minted a brand new uid
// whenever the browser lost its storage, so request.auth.uid could never be
// tied to a user's document and the security rules had to stay wide open.
//
// Flow:
//   1. client sends its LINE access token (liff.getAccessToken())
//   2. LINE confirms the token was issued for OUR channel, and says whose it is
//   3. we look up that person's existing users/ document with a service account
//   4. we mint a Firebase custom token for that document's id
//
// Existing accounts keep the uid they registered with, so no data moves.
// New accounts get a deterministic uid derived from the LINE user id.
//
// Required Vercel env vars:
//   FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY
//   LINE_LOGIN_CHANNEL_ID
// ============================================================

import crypto from 'node:crypto';

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'ncds-nrru-model';
const CLIENT_EMAIL = process.env.FIREBASE_CLIENT_EMAIL || '';
// A PEM survives the trip through a dashboard field in several shapes: with
// backslash-n as two characters (how the JSON spells it), with real newlines,
// with the JSON's quotes still attached, or — when the input strips them — with
// no line breaks at all. Rather than guess which, rebuild the PEM from its
// base64 body, which is the same in every case.
export function normalizePem(raw) {
  const text = String(raw || '')
    .replace(/\\r/g, '')
    .replace(/\\n/g, '\n')
    .trim()
    .replace(/^["']|["']$/g, '')
    .trim();

  const match = text.match(/-----BEGIN ([A-Z ]+?)-----([\s\S]*?)-----END \1-----/);
  if (!match) return text; // not a PEM at all; let createPrivateKey say so

  const [, label, body] = match;
  const base64 = body.replace(/[^A-Za-z0-9+/=]/g, '');
  const lines = base64.match(/.{1,64}/g) || [];
  return `-----BEGIN ${label}-----\n${lines.join('\n')}\n-----END ${label}-----\n`;
}

const PRIVATE_KEY = normalizePem(process.env.FIREBASE_PRIVATE_KEY);
const LINE_CHANNEL_ID = process.env.LINE_LOGIN_CHANNEL_ID || '2010458383';

const b64url = (input) => Buffer.from(input).toString('base64url');

function signJwt(claims) {
  const body = `${b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64url(JSON.stringify(claims))}`;
  const signature = crypto.createSign('RSA-SHA256').update(body).sign(PRIVATE_KEY);
  return `${body}.${b64url(signature)}`;
}

// ── LINE: whose token is this, and was it issued for us? ────
async function lineUserIdFor(accessToken) {
  const verify = await fetch(
    `https://api.line.me/oauth2/v2.1/verify?access_token=${encodeURIComponent(accessToken)}`
  );
  if (!verify.ok) return null;

  const info = await verify.json();
  // a token minted for a different channel must not unlock an account here
  if (String(info.client_id) !== String(LINE_CHANNEL_ID)) {
    console.warn('LINE token issued for channel', info.client_id);
    return null;
  }

  const profile = await fetch('https://api.line.me/v2/profile', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!profile.ok) return null;
  return (await profile.json()).userId || null;
}

// ── Google: a service-account access token for Firestore ────
let cachedToken = null; // { value, expiresAt } — reused while the instance is warm
async function googleAccessToken() {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;

  const now = Math.floor(Date.now() / 1000);
  const assertion = signJwt({
    iss: CLIENT_EMAIL,
    scope: 'https://www.googleapis.com/auth/datastore',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  });

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  if (!res.ok) throw new Error(`Google token exchange failed: ${await res.text()}`);

  const data = await res.json();
  cachedToken = { value: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return cachedToken.value;
}

// The id of this person's existing users/ document, or null if they are new.
async function existingUserId(lineUid) {
  const res = await fetch(
    `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents:runQuery`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${await googleAccessToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: 'users' }],
          where: {
            fieldFilter: {
              field: { fieldPath: 'lineUid' },
              op: 'EQUAL',
              value: { stringValue: lineUid },
            },
          },
          limit: 1,
        },
      }),
    }
  );
  if (!res.ok) throw new Error(`Firestore lookup failed: ${await res.text()}`);

  const rows = await res.json();
  const name = rows.find((row) => row.document)?.document?.name;
  return name ? name.split('/').pop() : null;
}

// Catches the common paste mistakes — quotes left on, key truncated, wrong
// field copied — at startup, with the reason, instead of letting them surface
// later as an unexplained signing failure.
let keyProblem = null;
if (PRIVATE_KEY) {
  try {
    crypto.createPrivateKey(PRIVATE_KEY);
  } catch (err) {
    keyProblem = err.message;
  }
}

// A key that reaches here without its -----BEGIN----- line is the mistake that
// actually happened: copying the middle of the JSON value and leaving the
// header and footer behind. Worth naming, because the DECODER error alone
// sends you looking at the key itself rather than at what was pasted.
const keyHint =
  keyProblem && !String(process.env.FIREBASE_PRIVATE_KEY || '').includes('-----BEGIN')
    ? 'FIREBASE_PRIVATE_KEY has no -----BEGIN PRIVATE KEY----- line; copy the whole private_key value, header and footer included'
    : keyProblem;

export function firebaseCustomToken(uid) {
  const now = Math.floor(Date.now() / 1000);
  return signJwt({
    iss: CLIENT_EMAIL,
    sub: CLIENT_EMAIL,
    aud: 'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit',
    iat: now,
    exp: now + 3600,
    uid,
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!CLIENT_EMAIL || !PRIVATE_KEY) {
    console.error('FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY are not set');
    return res.status(500).json({ error: 'Auth service is not configured' });
  }

  // This check sits in front of the LINE token check, so anyone can reach it.
  // The reason goes to the logs; the caller gets a bare "misconfigured".
  if (keyProblem) {
    console.error('FIREBASE_PRIVATE_KEY is not a usable PEM:', keyHint);
    return res.status(500).json({ error: 'Auth service is not configured' });
  }

  // Which step failed matters a lot when this breaks, and every step past the
  // LINE check already required a valid token for this channel, so naming it
  // in the response gives nothing away.
  let step = 'read request';
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const accessToken = String(body?.lineAccessToken || '').trim();
    if (!accessToken) {
      // keyOk is a deploy marker as much as a status: reaching this line means
      // the running build parsed the service account key. Without it, this
      // response is indistinguishable from an older build's.
      return res.status(400).json({ error: 'lineAccessToken is required', keyOk: true });
    }

    step = 'verify LINE token';
    const lineUid = await lineUserIdFor(accessToken);
    if (!lineUid) {
      return res.status(401).json({ error: 'LINE access token is not valid for this app' });
    }

    step = 'look up the account in Firestore';
    const existing = await existingUserId(lineUid);
    const uid = existing || `line_${lineUid}`;

    step = 'mint the custom token';
    const token = firebaseCustomToken(uid);

    return res.status(200).json({ token, uid, isNew: !existing });
  } catch (error) {
    console.error(`line-auth failed while trying to ${step}:`, error);
    return res.status(500).json({
      error: `Could not sign in with LINE (failed to ${step})`,
      detail: String(error.message || error).slice(0, 300),
    });
  }
}
