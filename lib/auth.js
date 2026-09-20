// ============================================================
// lib/auth.js  –  Simplified Auth / Session Helper
// ============================================================
// Now uses Firebase Auth as the sole source of truth.
// No more anonymous auth fallback, no hybrid modes.
// 
// Flow:
//   1. login.html: LINE login → get lineUserId
//   2. Call Cloud Function → get Custom Token → signInWithCustomToken
//   3. auth.currentUser.uid === Firestore doc ID (stable across sessions)
//   4. All pages use auth.currentUser.uid directly (not localStorage)
//
// localStorage is still used for convenience data (name, avatar, lineUid)
// but NOT for UID/auth decisions.
// ============================================================

const KEYS = {
  uid:         'vv_uid',
  name:        'vv_name',
  avatar:      'vv_avatar',
  lineUid:     'vv_line_uid',
  phone:       'vv_phone',
  birth:       'vv_birth_date',
  iw:          'vv_init_weight',
  ih:          'vv_init_height',
  firestoreUid: 'vv_firestore_uid', // authoritative Firestore UID (stable)
};

function _get(k) {
  return localStorage.getItem(k) || sessionStorage.getItem(k) || null;
}

// Returns cached session data from localStorage for quick UI display.
// UID is cached but callers should verify against Firebase Auth if possible.
export function getSession() {
  return {
    uid:           _get(KEYS.uid),
    displayName:   _get(KEYS.name)    || 'ผู้ใช้',
    avatar:        _get(KEYS.avatar)  || '',
    lineUid:       _get(KEYS.lineUid) || null,
    phone:         _get(KEYS.phone)   || '',
    birthDate:     _get(KEYS.birth)   || '',
    initialWeight: _get(KEYS.iw)      ? parseFloat(_get(KEYS.iw)) : null,
    initialHeight: _get(KEYS.ih)      ? parseFloat(_get(KEYS.ih)) : null,
  };
}

export function saveSession({ uid, displayName, avatar, lineUid, phone, birthDate, initialWeight, initialHeight }) {
  const write = (k, v) => {
    if (v == null || v === '') return;
    localStorage.setItem(k, v);
    sessionStorage.setItem(k, v);
  };
  write(KEYS.uid,     uid);
  write(KEYS.name,    displayName);
  write(KEYS.avatar,  avatar);
  write(KEYS.lineUid, lineUid);
  write(KEYS.phone,   phone);
  write(KEYS.birth,   birthDate);
  if (initialWeight != null) write(KEYS.iw, String(initialWeight));
  if (initialHeight != null) write(KEYS.ih, String(initialHeight));
}

// ============================================================
// 🔑 AUTHORITATIVE UID HANDLING
// 
// Because we use signInAnonymously (which creates a NEW UID
// each sign-in), the Firebase Auth UID often doesn't match
// the user's Firestore document ID.
// 
// We store the REAL Firestore UID separately in vv_firestore_uid
// so pages can always query the correct data regardless of
// what auth.currentUser.uid says.
// 
// Once the Cloud Function generateLineAuthToken is deployed,
// this fallback will no longer be needed.
// ============================================================

// Returns the authoritative Firestore UID (stable across sessions)
export function getFirestoreUid() {
  return _get(KEYS.firestoreUid) || _get(KEYS.uid) || null;
}

// Saves the authoritative Firestore UID
export function saveFirestoreUid(uid) {
  if (!uid) return;
  localStorage.setItem(KEYS.firestoreUid, uid);
  sessionStorage.setItem(KEYS.firestoreUid, uid);
  // Also sync the regular uid key
  localStorage.setItem(KEYS.uid, uid);
  sessionStorage.setItem(KEYS.uid, uid);
}

export function clearSession() {
  Object.values(KEYS).forEach(k => {
    localStorage.removeItem(k);
    sessionStorage.removeItem(k);
  });
}

// Call at the top of every protected page.
// If not logged in → redirects automatically and returns null.
export function requireAuth() {
  const firestoreUid = getFirestoreUid();
  if (!firestoreUid) {
    const redirect = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.href = `/login.html?redirect=${redirect}`;
    return null;
  }
  // Return session with reliable UID
  const session = getSession();
  return { ...session, uid: firestoreUid };
}