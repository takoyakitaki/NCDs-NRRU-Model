// Exercises firestore.rules against the emulator. These rules are the only
// thing standing between one patient's records and everyone else's, so both
// directions matter: strangers must be refused, and owners must still work.
//
//   npx firebase emulators:exec --only firestore "node test_rules.mjs"
import assert from 'node:assert/strict';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import {
  doc, getDoc, setDoc, updateDoc, deleteDoc,
  collection, getDocs, query, where,
} from 'firebase/firestore';

const ADMIN_UID = 'PJWosepqPObqnE1geMWz5k6qEmy2';
const ALICE = 'line_Ualice';
const MALLORY = 'line_Umallory';

const env = await initializeTestEnvironment({
  projectId: 'ncds-nrru-model',
  firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
});

// Seed as admin-of-the-emulator (rules bypassed) so the tests start from a
// realistic database rather than an empty one.
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  await setDoc(doc(db, 'users', ALICE), { uid: ALICE, displayName: 'Alice', phone: '0812345678', points: 50 });
  await setDoc(doc(db, 'users', MALLORY), { uid: MALLORY, displayName: 'Mallory', phone: '0899999999', points: 10 });
  await setDoc(doc(db, 'healthLogs', 'h1'), { uid: ALICE, type: 'bloodsugar', value: 130 });
  await setDoc(doc(db, 'foodLogs', 'f1'), { uid: ALICE, date: '2026-09-20', calories: 500 });
  await setDoc(doc(db, 'leaderboard', ALICE), { uid: ALICE, displayName: 'Alice', points: 50 });
  await setDoc(doc(db, 'missions', 'm1'), { title: 'test', active: true });
});

const alice = env.authenticatedContext(ALICE).firestore();
const mallory = env.authenticatedContext(MALLORY).firestore();
const admin = env.authenticatedContext(ADMIN_UID).firestore();
const anon = env.unauthenticatedContext().firestore();

// ── the hole this migration exists to close ──────────────────
await assertFails(getDoc(doc(mallory, 'users', ALICE)));
await assertFails(getDoc(doc(mallory, 'healthLogs', 'h1')));
await assertFails(updateDoc(doc(mallory, 'users', ALICE), { points: 99999 }));
await assertFails(deleteDoc(doc(mallory, 'healthLogs', 'h1')));
await assertFails(getDocs(collection(mallory, 'users')));
await assertFails(getDocs(collection(mallory, 'healthLogs')));
await assertFails(getDocs(query(collection(mallory, 'foodLogs'), where('uid', '==', ALICE))));
// a record planted under someone else's name
await assertFails(setDoc(doc(mallory, 'foodLogs', 'forged'), { uid: ALICE, calories: 1 }));
// signed out gets nothing at all
await assertFails(getDoc(doc(anon, 'users', ALICE)));
await assertFails(getDocs(collection(anon, 'missions')));

// ── owners still have a working app ──────────────────────────
await assertSucceeds(getDoc(doc(alice, 'users', ALICE)));
await assertSucceeds(updateDoc(doc(alice, 'users', ALICE), { calorieGoal: 1800 }));
await assertSucceeds(getDocs(query(collection(alice, 'foodLogs'), where('uid', '==', ALICE))));
await assertSucceeds(setDoc(doc(alice, 'foodLogs', 'f2'), { uid: ALICE, date: '2026-09-20', calories: 300 }));
await assertSucceeds(updateDoc(doc(alice, 'foodLogs', 'f1'), { calories: 600 }));
await assertSucceeds(deleteDoc(doc(alice, 'foodLogs', 'f1')));
await assertSucceeds(setDoc(doc(alice, 'dailyCalorieSummaries', `${ALICE}_2026-09-20`), { uid: ALICE, calories: 800 }));
await assertSucceeds(getDoc(doc(alice, 'missions', 'm1')));

// ── ranking works without exposing users/ ────────────────────
await assertSucceeds(getDocs(collection(mallory, 'leaderboard')));
await assertSucceeds(setDoc(doc(alice, 'leaderboard', ALICE), { uid: ALICE, points: 60 }));
await assertFails(setDoc(doc(mallory, 'leaderboard', ALICE), { uid: ALICE, points: 99999 }));

// ── catalogue is read-only for players ───────────────────────
await assertFails(setDoc(doc(alice, 'missions', 'm2'), { title: 'free points', points: 9999 }));
await assertFails(setDoc(doc(alice, 'rewards', 'r1'), { title: 'free stuff', points: 0 }));

// ── admin keeps working ──────────────────────────────────────
await assertSucceeds(getDocs(collection(admin, 'users')));
await assertSucceeds(getDocs(collection(admin, 'healthLogs')));
await assertSucceeds(updateDoc(doc(admin, 'users', ALICE), { points: 70 }));
await assertSucceeds(setDoc(doc(admin, 'missions', 'm3'), { title: 'admin made', active: true }));
await assertSucceeds(deleteDoc(doc(admin, 'healthLogs', 'h1')));

// ── unknown collections are denied by default ────────────────
await assertFails(setDoc(doc(alice, 'somethingNew', 'x'), { uid: ALICE }));

await env.cleanup();
console.log('ok — firestore.rules: strangers blocked, owners and admin unaffected');
