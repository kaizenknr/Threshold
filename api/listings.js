// Community listings board — rooms, sublets, shared spaces
import {
  checkRateLimit, getClientIP, setCORSHeaders, setSecurityHeaders, parseBody,
} from './_security.js';

const SPACE_TYPES = ['private_room', 'whole_unit', 'studio', 'sublet'];
const LEASE_TERMS = ['month_to_month', 'semester', '6_month', '12_month', 'flexible'];

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

  const hdrs = {
    apikey: SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
    'Content-Type': 'application/json',
  };

  const str = (v, max) => {
    if (typeof v !== 'string') return null;
    const t = v.trim().slice(0, max);
    return t || null;
  };
  const num = (v, min, max) => {
    if (v === null || v === undefined || v === '') return null;
    const n = parseFloat(v);
    if (!isFinite(n)) return null;
    return Math.min(max, Math.max(min, n));
  };

  // ── Submit listing ─────────────────────────────────────────────────────────
  if (body.action === 'submit') {
    // Rate limit: 10 listing posts per IP per hour
    const ip = getClientIP(req);
    if (!checkRateLimit(ip, 'listing-submit', 10)) {
      return res.status(429).json({ error: 'Too many listings posted. Try again later.' });
    }

    const space_type = SPACE_TYPES.includes(body.space_type) ? body.space_type : null;
    const city = str(body.city, 100);
    const rent = num(body.rent, 1, 50000);
    if (!space_type || !city || !rent)
      return res.status(400).json({ error: 'space_type, city, and rent required' });

    const description  = str(body.description, 2000);
    const landlord_name = str(body.landlord_name, 200);

    // Associate listing with logged-in user if token provided (fail open)
    let user_id = null;
    const access_token = str(body.access_token, 2048);
    if (access_token) {
      try {
        const uRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
          headers: { 'apikey': SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${access_token}` },
          signal: AbortSignal.timeout(4000),
        });
        if (uRes.ok) { const u = await uRes.json(); user_id = u?.id || null; }
      } catch (_e) {}
    }

    // Content moderation (fail open)
    const ANTHROPIC_KEY = process.env.ANTHROPIC_KEY;
    if (ANTHROPIC_KEY && description) {
      try {
        const modRes = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': ANTHROPIC_KEY,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 200,
            system: 'You are a content moderator for a rental transparency platform. Return ONLY valid JSON.',
            messages: [{
              role: 'user',
              content: `Review this rental listing description. Flag ONLY: personal info of third parties (names/phones/addresses of individuals other than the poster's own contact info), hate speech, slurs, scam patterns (wire money, gift cards, "landlord overseas"), or gibberish. Do NOT flag normal listing language.

Text: "${description.slice(0, 1000)}"

Return ONLY: {"ok":true|false,"reason":"string or null"}`
            }],
          }),
          signal: AbortSignal.timeout(10000),
        });
        if (modRes.ok) {
          const d = await modRes.json();
          const txt = (d.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
          const m = txt.match(/\{[\s\S]*\}/);
          if (m) {
            const p = JSON.parse(m[0]);
            if (!p.ok) return res.status(400).json({ error: 'Description flagged: ' + (p.reason || 'content violation') });
          }
        }
      } catch (_e) {}
    }

    const dateStr = typeof body.available_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.available_date.trim())
      ? body.available_date.trim() : null;

    const row = {
      space_type,
      title:              str(body.title, 120),
      city,
      neighborhood:       str(body.neighborhood, 100),
      rent,
      app_fee:            num(body.app_fee, 0, 50000),
      deposit:            num(body.deposit, 0, 50000),
      fees_disclosed:     body.fees_disclosed !== false && body.fees_disclosed !== 'false',
      roommates:          Math.round(num(body.roommates, 0, 20) ?? 0),
      bedrooms:           body.bedrooms !== undefined && body.bedrooms !== null && body.bedrooms !== '' ? Math.round(num(body.bedrooms, 0, 20) ?? 0) : null,
      bathrooms:          num(body.bathrooms, 0, 20),
      landlord_name,
      near_campus:        str(body.near_campus, 120),
      near_transit:       body.near_transit === true || body.near_transit === 'true',
      pets_ok:            body.pets_ok === true || body.pets_ok === 'true',
      vouchers_ok:        body.vouchers_ok === true || body.vouchers_ok === 'true',
      furnished:          body.furnished === true || body.furnished === 'true',
      utilities_included: body.utilities_included === true || body.utilities_included === 'true',
      available_date:     dateStr,
      lease_term:         LEASE_TERMS.includes(body.lease_term) ? body.lease_term : null,
      description,
      contact_method:     str(body.contact_method, 200),
      status:             'active',
      user_id,
    };

    try {
      const saveRes = await fetch(`${SUPABASE_URL}/rest/v1/listings`, {
        method: 'POST',
        headers: { ...hdrs, Prefer: 'return=representation' },
        body: JSON.stringify(row),
        signal: AbortSignal.timeout(5000),
      });
      if (!saveRes.ok) {
        return res.status(500).json({ error: 'Could not save listing. Please try again.' });
      }
      const saved = await saveRes.json();
      const listingId = saved?.[0]?.id;

      if (listingId && landlord_name) {
        fetch(`${SUPABASE_URL}/rest/v1/listing_price_history`, {
          method: 'POST',
          headers: { ...hdrs, Prefer: 'return=minimal' },
          body: JSON.stringify({
            listing_id: listingId,
            landlord_name: landlord_name.toLowerCase().trim(),
            city: city.toLowerCase().trim(),
            space_type,
            rent,
          }),
        }).catch(() => {});
      }
    } catch (_e) {
      return res.status(500).json({ error: 'Could not save listing. Please try again.' });
    }

    console.log(`LISTING SAVED: ${space_type} @ "${city}" $${rent}`);
    return res.status(200).json({ ok: true });
  }

  // ── Distinct neighborhoods for a city ────────────────────────────────────
  if (body.action === 'neighborhoods') {
    const city = str(body.city, 100);
    if (!city) return res.status(400).json({ error: 'city required' });
    try {
      const cityEnc = encodeURIComponent('*' + city + '*');
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/listings?status=eq.active&city=ilike.${cityEnc}&neighborhood=not.is.null&select=neighborhood&limit=300`,
        { headers: hdrs, signal: AbortSignal.timeout(4000) }
      );
      if (!r.ok) return res.status(500).json({ error: 'Failed' });
      const rows = await r.json();
      const counts = {};
      rows.forEach(row => {
        if (row.neighborhood?.trim()) counts[row.neighborhood.trim()] = (counts[row.neighborhood.trim()] || 0) + 1;
      });
      const hoods = Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([n]) => n);
      return res.status(200).json({ ok: true, neighborhoods: hoods.slice(0, 20) });
    } catch (e) {
      return res.status(500).json({ error: 'Could not load neighborhoods.' });
    }
  }

  // ── Landlord history — all listings (any status) for a given landlord ─────
  if (body.action === 'landlord_history') {
    const landlord = str(body.landlord, 200);
    if (!landlord) return res.status(400).json({ error: 'landlord required' });
    try {
      const nameEnc = encodeURIComponent('*' + landlord + '*');
      const lRes = await fetch(
        `${SUPABASE_URL}/rest/v1/listings?landlord_name=ilike.${nameEnc}&select=id,space_type,city,neighborhood,rent,status,created_at,bedrooms,bathrooms,title&order=created_at.desc&limit=30`,
        { headers: hdrs, signal: AbortSignal.timeout(4000) }
      );
      const listings = lRes.ok ? await lRes.json() : [];

      const histEnc = encodeURIComponent(landlord.toLowerCase().trim());
      const hRes = await fetch(
        `${SUPABASE_URL}/rest/v1/listing_price_history?landlord_name=ilike.${histEnc}&select=rent,space_type,city,recorded_at&order=recorded_at.desc&limit=20`,
        { headers: hdrs, signal: AbortSignal.timeout(4000) }
      );
      const priceHistory = hRes.ok ? await hRes.json() : [];
      const rents = priceHistory.map(h => h.rent).filter(Boolean);
      const rentTrend = rents.length >= 2
        ? (rents[0] > rents[rents.length - 1] ? 'up' : rents[0] < rents[rents.length - 1] ? 'down' : 'flat')
        : 'unknown';

      return res.status(200).json({
        ok: true,
        listings: listings || [],
        price_history: priceHistory || [],
        rent_range: rents.length ? { min: Math.min(...rents), max: Math.max(...rents), count: rents.length } : null,
        rent_trend: rentTrend,
      });
    } catch (e) {
      return res.status(500).json({ error: 'Could not load listing history.' });
    }
  }

  // ── Fetch active listings ─────────────────────────────────────────────────
  try {
    let url = `${SUPABASE_URL}/rest/v1/listings?status=eq.active&select=*&order=created_at.desc&limit=60`;
    const city = str(body.city, 100);
    if (city) url += `&city=ilike.${encodeURIComponent('*' + city + '*')}`;
    if (SPACE_TYPES.includes(body.space_type)) url += `&space_type=eq.${body.space_type}`;
    const maxRent = num(body.max_rent, 1, 50000);
    if (maxRent) url += `&rent=lte.${maxRent}`;
    const minRm = num(body.min_roommates, 0, 20);
    if (minRm !== null) url += `&roommates=gte.${Math.round(minRm)}`;
    const maxRm = num(body.max_roommates, 0, 20);
    if (maxRm !== null) url += `&roommates=lte.${Math.round(maxRm)}`;
    const neighborhood = str(body.neighborhood, 100);
    if (neighborhood) url += `&neighborhood=ilike.${encodeURIComponent('*' + neighborhood + '*')}`;

    const lRes = await fetch(url, { headers: hdrs, signal: AbortSignal.timeout(5000) });
    if (!lRes.ok) return res.status(500).json({ error: 'Could not load listings.' });
    const rows = await lRes.json();
    return res.status(200).json({ ok: true, listings: rows || [] });
  } catch (e) {
    console.error('LISTINGS error:', e.message);
    return res.status(500).json({ error: 'Could not load listings.' });
  }
}
