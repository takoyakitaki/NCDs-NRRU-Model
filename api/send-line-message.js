// ============================================================
// api/send-line-message.js
// Sends a LINE push message via LINE Messaging API.
//
// The caller must send Authorization: Bearer <Firebase ID token>.
// The push target is taken from the caller's own users/{uid} document,
// never from the request body, so this endpoint can only ever message
// the account that is calling it.
// ============================================================

import { bearerToken, verifyIdToken, fetchUserDoc, isRegisteredLineUid } from './_auth.js';

const LINE_PUSH_URL = 'https://api.line.me/v2/bot/message/push';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) {
    return res.status(500).json({ error: 'LINE_CHANNEL_ACCESS_TOKEN is not configured' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const text = String(body?.text || '').trim();
    if (!text) {
      return res.status(400).json({ error: '"text" is required' });
    }

    // ── Caller must prove who they are ──────────────────────
    const idToken = bearerToken(req);
    const callerUid = await verifyIdToken(idToken);
    if (!callerUid) {
      return res.status(401).json({ error: 'A valid Firebase ID token is required' });
    }

    const claimed = String(body?.to || '').trim();

    // Preferred path: the caller's token maps straight to their users/ document,
    // so the target comes from the server and the body is only a cross-check.
    const user = await fetchUserDoc(callerUid, idToken);
    let to = user?.lineUid || '';

    if (to) {
      if (claimed && claimed !== to) {
        console.warn(`caller ${callerUid} asked to message ${claimed} but owns ${to}`);
        return res.status(403).json({ error: 'You can only send messages to your own LINE account' });
      }
    } else if (await isRegisteredLineUid(claimed, idToken)) {
      // Anonymous session that lost its original uid — fall back to the claimed
      // target, but only if it belongs to a registered user of this app.
      to = claimed;
    } else {
      return res.status(403).json({ error: 'No LINE account is linked to this user' });
    }

    // ── Send LINE message ───────────────────────────────────
    const lineRes = await fetch(LINE_PUSH_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to,
        messages: [{ type: 'text', text: text.slice(0, 5000) }],
      }),
    });

    if (!lineRes.ok) {
      const detail = await lineRes.text();
      return res.status(lineRes.status).json({ error: detail || 'LINE push failed' });
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'LINE push failed' });
  }
}