const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { getFirestore } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");
const admin = require("firebase-admin");

admin.initializeApp();
const db = getFirestore();
const auth = getAuth();

exports.generateLineAuthToken = onCall(
  { 
    cors: [
      "https://ncds-nrru.vercel.app",
      "http://localhost:3000",
      "http://localhost:5173"
    ]
  },
  async (request) => {
    try {
      // ตรวจสอบว่ามี lineUid ส่งมาไหม
      const lineUid = request.data.lineUid;
      if (!lineUid) {
        console.error("❌ Missing lineUid in request");
        throw new HttpsError("invalid-argument", "Missing lineUid");
      }

      console.log("🔍 Searching for user with lineUid:", lineUid);

      // ค้นหา user ใน Firestore
      const userSnapshot = await db.collection("users").where("lineUid", "==", lineUid).limit(1).get();
      
      if (userSnapshot.empty) {
        console.warn("⚠️ User not found for lineUid:", lineUid);
        throw new HttpsError("not-found", "User not found with lineUid: " + lineUid);
      }

      // ดึง UID เดิมที่ถูกสร้างตอน Register ครั้งแรก
      const originalUid = userSnapshot.docs[0].id;
      console.log("✅ Found user, original UID:", originalUid);

      // สร้าง Custom Token สำหรับ UID นี้
      const customToken = await auth.createCustomToken(originalUid);
      console.log("✅ Custom token created for UID:", originalUid);
      
      return { token: customToken };
    } catch (err) {
      console.error("❌ Error in generateLineAuthToken:", err.message || err);
      if (err instanceof HttpsError) {
        throw err;
      }
      throw new HttpsError("internal", err.message || "Failed to generate token");
    }
  }
);