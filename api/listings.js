// Community listings board — rooms, sublets, shared spaces
// Table: listings

const SPACE_TYPES = ['private_room', 'whole_unit', 'studio', 'sublet'];
const LEASE_TERMS = ['month_to_month', 'semester', '6_month', '12_month', 'flexible'];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end('Method not allowed');

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY)
    return res.status(500).json({ error: 'DB not configured' });

  let body = req.body;
  if (typeof body === 'string') try { body = JSON.parse(body); } catch (e) { body = {}; }
  body = body || {};

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

  // ── Submit listing ────────────────────────────────────────────────────────────
  if (body.action === 'submit') {
    const space_type = SPACE_TYPES.includes(body.space_type) ? body.space_type : null;
    const city = str(body.city, 100);
    const rent = num(body.rent, 1, 50000);
    if (!space_type || !city || !rent)
      return res.status(400).json({ error: 'space_type, city, and rent required' });

    const description = str(body.description, 2000);

    // Content moderation via Claude (fail open if key missing or call fails)
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
      landlord_name:      str(body.landlord_name, 200),
      near_campus:        str(body.near_campus, 120),
      near_transit:       body.near_transit === true || body.near_transit === 'true',
      pets_ok:            body.pets_ok === true || body.pets_ok === 'true',
      vouchers_ok:        body.vouchers_ok === true || body.vouchers_ok === 'true',
      furnished:          body.furnished === true || body.furnished === 'true',
      utilities_included: body.utilities_included === true || body.utilities_included === 'true',
      available_date:     dateStr,
      lease_term:         LEASE_TERMS.includes(body.lease_term) ? body.lease_term.slice(0, 30) : null,
      description,
      contact_method:     str(body.contact_method, 200),
      status:             'active',
    };

    const saveRes = await fetch(`${SUPABASE_URL}/rest/v1/listings`, {
      method: 'POST',
      headers: { ...hdrs, Prefer: 'return=minimal' },
      body: JSON.stringify(row),
    });

    if (!saveRes.ok) {
      const e = await saveRes.text();
      return res.status(500).json({ error: 'Failed to save listing', detail: e.slice(0, 100) });
    }

    console.log(`LISTING SAVED: ${space_type} @ "${city}" $${rent}`);
    return res.status(200).json({ ok: true });
  }

  // ── Fetch listings ────────────────────────────────────────────────────────────
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

    const lRes = await fetch(url, { headers: hdrs });
    if (!lRes.ok) {
      const e = await lRes.text();
      return res.status(500).json({ error: 'Fetch failed', detail: e.slice(0, 100) });
    }
    const rows = await lRes.json();
    return res.status(200).json({ ok: true, listings: rows || [] });
  } catch (e) {
    console.error('LISTINGS error:', e.message);
    return res.status(500).json({ error: e.message });
  }
}
