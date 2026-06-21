const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { getFirestore } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");
const admin = require("firebase-admin");

admin.initializeApp();
const db = getFirestore();
const auth = getAuth();

exports.generateLineAuthToken = onCall(async (request) => {
  // ตรวจสอบว่ามี lineUid ส่งมาไหม
  const lineUid = request.data.lineUid;
  if (!lineUid) {
    throw new HttpsError("invalid-argument", "Missing lineUid");
  }

  // ค้นหา user ใน Firestore
  const userSnapshot = await db.collection("users").where("lineUid", "==", lineUid).limit(1).get();
  
  if (userSnapshot.empty) {
    throw new HttpsError("not-found", "User not found");
  }

  // ดึง UID เดิมที่ถูกสร้างตอน Register ครั้งแรก
  const originalUid = userSnapshot.docs[0].id;

  // สร้าง Custom Token สำหรับ UID นี้
  const customToken = await auth.createCustomToken(originalUid);
  
  return { token: customToken };
});