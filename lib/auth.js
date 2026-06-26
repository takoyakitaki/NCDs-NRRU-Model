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
  uid:     'vv_uid',
  name:    'vv_name',
  avatar:  'vv_avatar',
  lineUid: 'vv_line_uid',
  phone:   'vv_phone',
  birth:   'vv_birth_date',
  iw:      'vv_init_weight',
  ih:      'vv_init_height',
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

export function clearSession() {
  Object.values(KEYS).forEach(k => {
    localStorage.removeItem(k);
    sessionStorage.removeItem(k);
  });
}

// Call at the top of every protected page.
// If not logged in → redirects automatically and returns null.
export function requireAuth() {
  const session = getSession();
  if (!session.uid) {
    const redirect = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.href = `/login.html?redirect=${redirect}`;
    return null;
  }
  return session;
}