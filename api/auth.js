// Email OTP authentication — proxied server-side so no Supabase keys reach the frontend
import {
  checkRateLimit, getClientIP, setCORSHeaders, setSecurityHeaders, parseBody,
} from './_security.js';

export default async function handler(req, res) {
  setCORSHeaders(req, res);
  setSecurityHeaders(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end('Method not allowed');

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY)
    return res.status(500).json({ error: 'Service unavailable' });

  const body = parseBody(req);
  const action = body.action;
  const ip = getClientIP(req);

  const sbHdrs = {
    'Content-Type': 'application/json',
    'apikey': SUPABASE_SERVICE_KEY,
    'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
  };

  // ── send-otp ───────────────────────────────────────────────────────────────
  if (action === 'send-otp') {
    if (!checkRateLimit(ip, 'auth-send-otp', 5))
      return res.status(429).json({ error: 'Too many requests. Try again later.' });

    const email = typeof body.email === 'string' ? body.email.trim().slice(0, 254) : '';
    if (!email) return res.status(400).json({ error: 'Email required.' });

    try {
      const r = await fetch(`${SUPABASE_URL}/auth/v1/otp`, {
        method: 'POST',
        headers: sbHdrs,
        body: JSON.stringify({ email, create_user: true }),
        signal: AbortSignal.timeout(8000),
      });
      if (!r.ok) return res.status(200).json({ error: 'Could not send code. Try again.' });
      return res.status(200).json({ ok: true });
    } catch (_e) {
      return res.status(200).json({ error: 'Could not send code. Try again.' });
    }
  }

  // ── verify-otp ─────────────────────────────────────────────────────────────
  if (action === 'verify-otp') {
    if (!checkRateLimit(ip, 'auth-verify-otp', 10))
      return res.status(429).json({ error: 'Too many requests. Try again later.' });

    const email = typeof body.email === 'string' ? body.email.trim().slice(0, 254) : '';
    const token = typeof body.token === 'string' ? body.token.trim().slice(0, 12) : '';
    if (!email || !token) return res.status(400).json({ error: 'Email and token required.' });

    try {
      const r = await fetch(`${SUPABASE_URL}/auth/v1/verify`, {
        method: 'POST',
        headers: sbHdrs,
        body: JSON.stringify({ email, token, type: 'email' }),
        signal: AbortSignal.timeout(8000),
      });
      if (!r.ok) return res.status(200).json({ error: 'Invalid or expired code.' });
      const d = await r.json();
      return res.status(200).json({
        ok: true,
        access_token: d.access_token || null,
        refresh_token: d.refresh_token || null,
        user_id: d.user?.id || null,
        email: d.user?.email || email,
      });
    } catch (_e) {
      return res.status(200).json({ error: 'Verification failed. Try again.' });
    }
  }

  // ── session ────────────────────────────────────────────────────────────────
  if (action === 'session') {
    const access_token = typeof body.access_token === 'string' ? body.access_token.trim().slice(0, 2048) : '';
    if (!access_token) return res.status(200).json({ ok: false });

    try {
      const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        headers: {
          'apikey': SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${access_token}`,
        },
        signal: AbortSignal.timeout(8000),
      });
      if (!r.ok) return res.status(200).json({ ok: false });
      const d = await r.json();
      return res.status(200).json({ ok: true, user_id: d.id || null, email: d.email || null });
    } catch (_e) {
      return res.status(200).json({ ok: false });
    }
  }

  // ── logout ─────────────────────────────────────────────────────────────────
  if (action === 'logout') {
    const access_token = typeof body.access_token === 'string' ? body.access_token.trim().slice(0, 2048) : '';
    try {
      if (access_token) {
        await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
          method: 'POST',
          headers: {
            'apikey': SUPABASE_SERVICE_KEY,
            'Authorization': `Bearer ${access_token}`,
          },
          signal: AbortSignal.timeout(8000),
        });
      }
    } catch (_e) {}
    return res.status(200).json({ ok: true });
  }

  return res.status(400).json({ error: 'Unknown action.' });
}
