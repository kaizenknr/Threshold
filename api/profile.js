// Profile CRUD + listing management
// All actions require a valid access_token in the body.
import {
  checkRateLimit, getClientIP, setCORSHeaders, setSecurityHeaders, parseBody, isUUID,
} from './_security.js';

const PROFILE_TYPES = ['renter', 'poster', 'both'];
const RENTER_TYPES = ['student', 'young_professional', 'family', 'senior', 'relocating', 'other'];
const VALID_CONCERNS = ['hidden_fees', 'mold', 'maintenance', 'ghost_landlord', 'deposit', 'noise', 'safety', 'pets', 'price'];
const VALID_LOOKING_FOR = ['private_room', 'studio', '1br', '2br', '3br', 'whole_unit', 'sublet'];
const VALID_STATUSES = ['active', 'inactive', 'rented'];

async function verifyToken(supabaseUrl, serviceKey, access_token) {
  try {
    const r = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        'apikey': serviceKey,
        'Authorization': `Bearer ${access_token}`,
      },
      signal: AbortSignal.timeout(6000),
    });
    if (!r.ok) return null;
    const d = await r.json();
    return d?.id || null;
  } catch (_e) {
    return null;
  }
}

export default async function handler(req, res) {
  setCORSHeaders(req, res);
  setSecurityHeaders(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end('Method not allowed');

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY)
    return res.status(500).json({ ok: false, error: 'Service unavailable' });

  const body = parseBody(req);
  const action = body.action;

  const hdrs = {
    'Content-Type': 'application/json',
    'apikey': SUPABASE_SERVICE_KEY,
    'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
  };

  // Verify token and extract uid
  const access_token = typeof body.access_token === 'string' ? body.access_token.slice(0, 2048) : '';
  if (!access_token) return res.status(401).json({ ok: false, error: 'Unauthorized' });

  const uid = await verifyToken(SUPABASE_URL, SUPABASE_SERVICE_KEY, access_token);
  if (!uid) return res.status(401).json({ ok: false, error: 'Unauthorized' });

  const ip = getClientIP(req);

  // ── get ────────────────────────────────────────────────────────────────────
  if (action === 'get') {
    try {
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(uid)}&select=*&limit=1`,
        { headers: hdrs, signal: AbortSignal.timeout(6000) }
      );
      if (!r.ok) return res.status(500).json({ ok: false, error: 'Could not fetch profile.' });
      const rows = await r.json();
      return res.status(200).json({ ok: true, profile: rows[0] || null });
    } catch (_e) {
      return res.status(500).json({ ok: false, error: 'Could not fetch profile.' });
    }
  }

  // ── update ─────────────────────────────────────────────────────────────────
  if (action === 'update') {
    if (!checkRateLimit(ip, 'profile-update', 20))
      return res.status(429).json({ ok: false, error: 'Too many requests. Try again later.' });

    const p = body.profile || {};
    const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) || null : null);
    const num = (v, min, max) => {
      const n = parseFloat(v);
      return isFinite(n) ? Math.min(max, Math.max(min, n)) : null;
    };
    const filterArr = (arr, allowed) => Array.isArray(arr) ? arr.filter(x => allowed.includes(x)) : [];

    const row = {
      id: uid,
      updated_at: new Date().toISOString(),
    };

    if (p.profile_type !== undefined) {
      if (!PROFILE_TYPES.includes(p.profile_type)) return res.status(400).json({ ok: false, error: 'Invalid profile_type.' });
      row.profile_type = p.profile_type;
    }
    if (p.renter_type !== undefined) {
      if (p.renter_type !== null && !RENTER_TYPES.includes(p.renter_type)) return res.status(400).json({ ok: false, error: 'Invalid renter_type.' });
      row.renter_type = p.renter_type;
    }
    if (p.city !== undefined) row.city = str(p.city, 100);
    if (p.budget !== undefined) row.budget = num(p.budget, 0, 50000);
    if (p.concerns !== undefined) row.concerns = filterArr(p.concerns, VALID_CONCERNS);
    if (p.looking_for !== undefined) row.looking_for = filterArr(p.looking_for, VALID_LOOKING_FOR);
    if (p.display_name !== undefined) row.display_name = str(p.display_name, 100);
    if (p.contact_method !== undefined) row.contact_method = str(p.contact_method, 200);

    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/profiles`, {
        method: 'POST',
        headers: { ...hdrs, 'Prefer': 'return=minimal,resolution=merge-duplicates' },
        body: JSON.stringify(row),
        signal: AbortSignal.timeout(6000),
      });
      if (!r.ok) return res.status(500).json({ ok: false, error: 'Could not save profile.' });
      return res.status(200).json({ ok: true });
    } catch (_e) {
      return res.status(500).json({ ok: false, error: 'Could not save profile.' });
    }
  }

  // ── my-listings ────────────────────────────────────────────────────────────
  if (action === 'my-listings') {
    try {
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/listings?user_id=eq.${encodeURIComponent(uid)}&select=*&order=created_at.desc&limit=50`,
        { headers: hdrs, signal: AbortSignal.timeout(6000) }
      );
      if (!r.ok) return res.status(500).json({ ok: false, error: 'Could not fetch listings.' });
      const rows = await r.json();
      return res.status(200).json({ ok: true, listings: rows || [] });
    } catch (_e) {
      return res.status(500).json({ ok: false, error: 'Could not fetch listings.' });
    }
  }

  // ── update-listing ─────────────────────────────────────────────────────────
  if (action === 'update-listing') {
    if (!checkRateLimit(ip, 'profile-update-listing', 30))
      return res.status(429).json({ ok: false, error: 'Too many requests. Try again later.' });

    const listing_id = body.listing_id;
    if (!isUUID(listing_id)) return res.status(400).json({ ok: false, error: 'Invalid listing_id.' });

    const status = body.status;
    if (!VALID_STATUSES.includes(status)) return res.status(400).json({ ok: false, error: 'Invalid status.' });

    try {
      // Verify ownership
      const checkRes = await fetch(
        `${SUPABASE_URL}/rest/v1/listings?id=eq.${encodeURIComponent(listing_id)}&user_id=eq.${encodeURIComponent(uid)}&select=id&limit=1`,
        { headers: hdrs, signal: AbortSignal.timeout(6000) }
      );
      if (!checkRes.ok) return res.status(500).json({ ok: false, error: 'Could not verify listing.' });
      const rows = await checkRes.json();
      if (!rows || !rows.length) return res.status(403).json({ ok: false, error: 'Forbidden.' });

      const patchRes = await fetch(
        `${SUPABASE_URL}/rest/v1/listings?id=eq.${encodeURIComponent(listing_id)}`,
        {
          method: 'PATCH',
          headers: { ...hdrs, 'Prefer': 'return=minimal' },
          body: JSON.stringify({ status }),
          signal: AbortSignal.timeout(6000),
        }
      );
      if (!patchRes.ok) return res.status(500).json({ ok: false, error: 'Could not update listing.' });
      return res.status(200).json({ ok: true });
    } catch (_e) {
      return res.status(500).json({ ok: false, error: 'Could not update listing.' });
    }
  }

  return res.status(400).json({ ok: false, error: 'Unknown action.' });
}
