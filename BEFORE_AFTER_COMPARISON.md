# 🔄 Auth System Refactoring: Before vs After

## ปัญหาหลัก (Problem)

```
food.html:347 ✅ LINE auth mode, using Firestore UID: cwO0pk1iqFQtQ041gAeXx9sw3xo2
food.html:442 ⚠️ User profile listener error (non-critical): Missing or insufficient permissions.
food.html:462 ❌ Food log listener failed: FirebaseError: Missing or insufficient permissions.
```

**สาเหตุ:** Anonymous Auth สร้าง UID ใหม่ทุก login → doc ID ไม่ตรง → `request.auth.uid` เป็น `null` → Firestore rules ปฏิเสธ

## การเปลี่ยนแปลง

| ก่อน (Broken) | หลัง (Fixed) |
|---------------|--------------|
| `signInAnonymously()` → UID ใหม่ทุกครั้ง | `generateLineAuthToken` Cloud Function → Custom Token → UID คงที่ |
| 2 auth modes: `'line'` และ `'anonymous'` | 1 auth mode: Firebase Auth (Custom Token) |
| `vv_auth_mode`, `vv_firestore_uid` ใน localStorage | ตัดออกทั้งหมด |
| `auth = null` ใน LINE mode → `request.auth` = null | `auth` จาก firebase.js → `request.auth.uid` มีค่าตลอด |
| ไม่มี `firestore.rules` → access ทุกคน | `firestore.rules` ป้องกัน per-user |
| LINE API ไม่ validate token | LINE API ตรวจสอบ `Authorization: Bearer` header |

## ไฟล์ที่แก้ไข

1. **`firestore.rules`** (ใหม่) — กำหนดสิทธิ์ per-user
2. **`login.html`** — ลบ Anonymous Auth, ใช้ Custom Token แทน
3. **`pages/food.html`** — ลบ auth mode branching, ใช้ `auth` จาก firebase.js
4. **`pages/health.html`** — แก้ CSS ที่ syntax ผิด
5. **`api/send-line-message.js`** — เพิ่ม Firebase ID Token validation
6. **`lib/auth.js`** — อัปเดต comments, โครงสร้างเดิมคงไว้ (backward compat)

## สิ่งที่ต้องทำก่อนใช้งาน

### 1. Deploy Cloud Function (สำคัญที่สุด!)
```bash
cd Functions
npm install
firebase deploy --only functions
```

Cloud Function `generateLineAuthToken`:
- รับ `{ lineUid: "U..." }`
- ค้นหา user doc ใน Firestore
- สร้าง Custom Token สำหรับ UID นั้น
- คืน `{ token: "..." }`

### 2. Deploy Firestore Rules
```bash
firebase deploy --only firestore:rules
```

### 3. Set Vercel Environment Variables
- `GEMINI_API_KEY` — สำหรับ analyze-food API
- `LINE_CHANNEL_ACCESS_TOKEN` — สำหรับ LINE push messages
- (Optional) `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` — สำหรับ token validation ใน send-line-message API

## Architecture After Fix

```
User opens app in LINE
        │
        ▼
  liff.init() → LINE Login
        │
        ▼
  getProfile() → { userId: "U123..." }
        │
        ▼
  Search Firestore by lineUid field
        │
        ├── Found → Cloud Function → Custom Token → signInWithCustomToken
        │                              │
        │                              ▼
        │                    auth.currentUser.uid === doc ID ✓
        │                              │
        │                              ▼
        │                    Firestore rules pass ✓
        │
        └── Not found → Register form → Create doc (ID = lineUserId)
                         → Cloud Function → Custom Token → signInWithCustomToken
```

## Backward Compatibility

- **ผู้ใช้เก่า (anonymous UID):** Cloud Function หา user จาก `lineUid` field → สร้าง token สำหรับ UID เดิม → ข้อมูลเดิมยังใช้ได้
- **ผู้ใช้ใหม่ (LINE UID):** ใช้ LINE userId เป็น doc ID → หาเจอเสมอ
- **Food logs, health logs, body stats, etc.:** ใช้ `uid` field ในการ query → ตรงกับ `request.auth.uid` → rules ผ่าน