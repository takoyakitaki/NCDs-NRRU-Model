// ============================================================
// lib/auth.js  –  Session helper
//
// Firebase Auth is the source of truth. login.html trades the LINE session
// for a custom token via /api/line-auth, so auth.currentUser.uid is the id of
// the user's Firestore document and stays the same on every device.
//
// localStorage still caches display data (name, avatar, lineUid) for a fast
// first paint, but requireAuth() only trusts a uid that the live Firebase
// session agrees with — the security rules compare request.auth.uid to the
// owner of each document, so a stale uid would read nothing anyway.
// ============================================================

import { auth } from './firebase.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';

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

// Resolves once Firebase has restored a persisted session, or decided there
// is none. Firestore requests queue behind this anyway.
function currentUser() {
  return new Promise((resolve) => {
    if (auth.currentUser) return resolve(auth.currentUser);
    const unsub = onAuthStateChanged(auth, (user) => { unsub(); resolve(user); });
  });
}

// Shown only when a second sign-in attempt still did not produce a usable
// session — without it the caller's `await new Promise(() => {})` would just
// spin forever on a blank screen.
function showSignInRequired() {
  document.body.innerHTML =
    '<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;' +
    'font-family:system-ui,sans-serif;background:#0f172a;color:#e2e8f0;padding:24px">' +
    '<div style="text-align:center;max-width:22rem">' +
    '<p style="font-size:2.5rem;margin:0 0 .5rem">🔒</p>' +
    '<p style="font-weight:800;margin:0 0 .5rem">เซสชันหมดอายุ</p>' +
    '<p style="font-size:.875rem;opacity:.7;margin:0 0 1.25rem">' +
    'เบราว์เซอร์อาจบล็อกการเก็บข้อมูล กรุณาเปิดจากแอป LINE แล้วเข้าสู่ระบบอีกครั้ง</p>' +
    '<a href="/login.html" style="display:inline-block;background:#10b981;color:#fff;' +
    'font-weight:800;padding:.75rem 1.75rem;border-radius:9999px;text-decoration:none">' +
    'เข้าสู่ระบบ</a></div></div>';
}

function goToLogin() {
  const url = new URL(window.location.href);
  // One bounce only. If we come back still broken, storage is blocked and
  // another round trip would just loop.
  if (url.searchParams.get('reauth') === '1') {
    showSignInRequired();
    return null;
  }
  url.searchParams.set('reauth', '1');
  window.location.href = `/login.html?redirect=${encodeURIComponent(url.pathname + url.search)}`;
  return null;
}

// Call at the top of every protected page:  const session = await requireAuth();
// Returns null when it is sending the user to log in.
export async function requireAuth() {
  const firestoreUid = getFirestoreUid();
  if (!firestoreUid) return goToLogin();

  const user = await currentUser();
  if (!user || user.isAnonymous || user.uid !== firestoreUid) {
    // Either no Firebase session, or a leftover anonymous one from before the
    // custom-token migration. Trade it for the real thing.
    console.warn('Session uid does not match Firebase Auth; signing in again');
    clearSession();
    return goToLogin();
  }

  return { ...getSession(), uid: firestoreUid };
}
