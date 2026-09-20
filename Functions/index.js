const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { getFirestore } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");
const admin = require("firebase-admin");

admin.initializeApp();
const db = getFirestore();
const auth = getAuth();

// LINE Login channel that issues the LIFF ID tokens (the numeric prefix of the LIFF IDs).
const LINE_CHANNEL_ID = process.env.LINE_LOGIN_CHANNEL_ID || "2010458383";

// Asks LINE whether this ID token is genuine and was issued for our channel.
// Returns the LINE user id it was issued to.
async function verifyLineIdToken(idToken) {
  const res = await fetch("https://api.line.me/oauth2/v2.1/verify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ id_token: idToken, client_id: LINE_CHANNEL_ID }),
  });

  if (!res.ok) {
    const detail = await res.text();
    console.warn("LINE token verification rejected:", res.status, detail);
    throw new HttpsError("unauthenticated", "LINE ID token is not valid");
  }

  const claims = await res.json();
  if (claims.aud !== LINE_CHANNEL_ID) {
    throw new HttpsError("unauthenticated", "LINE ID token was issued for another channel");
  }
  if (!claims.sub) {
    throw new HttpsError("unauthenticated", "LINE ID token carries no subject");
  }
  return claims.sub;
}

exports.generateLineAuthToken = onCall(
  {
    cors: [
      "https://ncds-nrru.vercel.app",
      "http://localhost:3000",
      "http://localhost:5173"
    ]
  },
  async (request) => {
    // The caller sends liff.getIDToken(). A raw lineUid is NOT accepted: anyone
    // who knew or guessed one could otherwise mint a token for that account.
    const lineIdToken = request.data?.lineIdToken;
    if (!lineIdToken) {
      throw new HttpsError("invalid-argument", "Missing lineIdToken");
    }

    const lineUid = await verifyLineIdToken(lineIdToken);

    const userSnapshot = await db
      .collection("users")
      .where("lineUid", "==", lineUid)
      .limit(1)
      .get();

    if (userSnapshot.empty) {
      throw new HttpsError("not-found", "No account is registered for this LINE user");
    }

    // the uid minted at registration, so the token always maps to the same doc
    const originalUid = userSnapshot.docs[0].id;
    const customToken = await auth.createCustomToken(originalUid);
    console.log("Custom token issued for uid:", originalUid);

    return { token: customToken };
  }
);
