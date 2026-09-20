// ============================================================
// api/_auth.js  –  Firebase ID token verification for the API routes
//
// Deliberately dependency-free: firebase-admin is not installed, so the
// previous verifyIdToken() path silently no-op'd and left both endpoints
// open. Google's own REST endpoints do the verification instead.
//
// Files prefixed with _ are not routed by Vercel.
// ============================================================

// The web API key is public by design (it ships in lib/firebase.js).
const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'ncds-nrru-model';
const API_KEY = process.env.FIREBASE_API_KEY || 'AIzaSyAVFQjoyrXmAMVjiFi7pVSc6kjcNbSZ5zs';

export function bearerToken(req) {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() : '';
}

// Verifies the token against Identity Toolkit. Returns the uid, or null.
export async function verifyIdToken(idToken) {
  if (!idToken) return null;
  try {
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data.users?.[0]?.localId || null;
  } catch {
    return null;
  }
}

// Reads users/{uid} through the Firestore REST API using the caller's own
// token, so Firestore itself re-checks the signature and the security rules.
export async function fetchUserDoc(uid, idToken) {
  try {
    const res = await fetch(
      `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/users/${encodeURIComponent(uid)}`,
      { headers: { Authorization: `Bearer ${idToken}` } }
    );
    if (!res.ok) return null;
    const doc = await res.json();
    // unwrap Firestore's typed values for the fields we care about
    const fields = doc.fields || {};
    return { lineUid: fields.lineUid?.stringValue || fields.lineUserId?.stringValue || '' };
  } catch {
    return null;
  }
}

// True when some registered user owns this LINE id.
//
// ponytail: this is a weaker check than "the caller owns it". Anonymous auth
// mints a fresh uid whenever the browser loses its storage, so the caller's
// token often cannot be tied back to their own users/ document. Replace both
// this and fetchUserDoc with a plain `uid === callerUid` comparison once
// generateLineAuthToken is deployed and sessions carry a stable uid.
export async function isRegisteredLineUid(lineUid, idToken) {
  if (!lineUid) return false;
  try {
    const res = await fetch(
      `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents:runQuery`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
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
    if (!res.ok) return false;
    const rows = await res.json();
    return Array.isArray(rows) && rows.some((row) => row.document);
  } catch {
    return false;
  }
}
