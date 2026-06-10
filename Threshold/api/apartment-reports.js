// Tenant report fetch + submit
// Tables: landlords, landlord_locations, apartment_reports

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
    Prefer: 'return=representation',
  };

  const normalize = n => n ? n.trim().toLowerCase()
    .replace(/[\s,]+(llc\.?|inc\.?|corp\.?|ltd\.?|co\.|properties|management|realty|group|apartments)\.?$/i, '')
    .trim() : '';

  // ── Submit report ─────────────────────────────────────────────────────────────
  if (body.action === 'submit') {
    const {
      landlord, address, city, unit_type, platform,
      outcome, issues, app_fee, app_fee_refunded, experience_text
    } = body;

    if (!landlord || !city) return res.status(400).json({ error: 'landlord and city required' });

    const safeLandlord = landlord.trim().slice(0, 200);
    const safeCity = city.trim().slice(0, 200);
    const landlordNorm = normalize(safeLandlord);

    // Find or create landlord record
    const word = encodeURIComponent(safeLandlord.split(/\s+/)[0]);
    const coSearch = await fetch(`${SUPABASE_URL}/rest/v1/landlords?name=ilike.*${word}*&select=id,name&limit=20`, { headers: hdrs });
    const coRows = coSearch.ok ? await coSearch.json() : [];
    let lid = (coRows || []).find(c => normalize(c.name) === landlordNorm)?.id || null;

    if (!lid) {
      const insRes = await fetch(`${SUPABASE_URL}/rest/v1/landlords`, {
        method: 'POST', headers: hdrs,
        body: JSON.stringify({ name: safeLandlord, logo_letter: safeLandlord[0]?.toUpperCase() || '?' })
      });
      if (insRes.ok) { const r = await insRes.json(); lid = Array.isArray(r) ? r[0]?.id : r?.id; }
    }
    if (!lid) return res.status(500).json({ error: 'Could not resolve landlord record' });

    // Find or create location record
    const locSearch = await fetch(
      `${SUPABASE_URL}/rest/v1/landlord_locations?landlord_id=eq.${lid}&city=ilike.${encodeURIComponent(safeCity)}&select=id&limit=1`,
      { headers: hdrs }
    );
    const locRows = locSearch.ok ? await locSearch.json() : [];
    let locId = locRows?.[0]?.id || null;
    if (!locId) {
      const locIns = await fetch(`${SUPABASE_URL}/rest/v1/landlord_locations`, {
        method: 'POST', headers: hdrs,
        body: JSON.stringify({ landlord_id: lid, city: safeCity })
      });
      if (locIns.ok) { const lr = await locIns.json(); locId = Array.isArray(lr) ? lr[0]?.id : lr?.id; }
    }

    const report = {
      landlord_id:      lid,
      landlord_name:    safeLandlord,
      location_id:      locId || null,
      address:          (address || '').trim().slice(0, 300),
      unit_type:        (unit_type || '').slice(0, 50),
      platform:         (platform || '').slice(0, 80),
      outcome:          outcome || 'unknown',
      issues:           Array.isArray(issues) ? issues.slice(0, 10) : [],
      app_fee:          app_fee ? parseFloat(app_fee) || null : null,
      app_fee_refunded: app_fee_refunded || 'na',
      experience_text:  experience_text ? experience_text.slice(0, 2000) : null,
      source:           'direct',
    };

    const saveRes = await fetch(`${SUPABASE_URL}/rest/v1/apartment_reports`, {
      method: 'POST',
      headers: { ...hdrs, Prefer: 'return=minimal' },
      body: JSON.stringify(report),
    });

    if (!saveRes.ok) {
      const e = await saveRes.text();
      return res.status(500).json({ error: 'Failed to save report', detail: e.slice(0, 100) });
    }

    console.log(`REPORT SAVED: "${safeLandlord}" @ "${safeCity}" landlord_id:${lid}`);
    return res.status(200).json({ ok: true, landlord_id: lid });
  }

  // ── Fetch reports ─────────────────────────────────────────────────────────────
  const { landlord, city } = body;
  if (!landlord) return res.status(400).json({ error: 'landlord required' });

  const canonical = normalize(landlord.trim());
  const firstWord = canonical.split(/\s+/)[0];
  const nameEnc = encodeURIComponent(`*${firstWord}*`);

  try {
    const url = `${SUPABASE_URL}/rest/v1/apartment_reports`
      + `?landlord_name=ilike.${nameEnc}`
      + `&select=id,landlord_name,address,unit_type,outcome,issues,app_fee,app_fee_refunded,experience_text,platform,created_at,location_id`
      + `&order=created_at.desc`
      + `&limit=100`;

    const rRes = await fetch(url, { headers: hdrs });
    if (!rRes.ok) return res.status(200).json({ ok: true, reports: [], cities: [] });
    const rows = await rRes.json();

    // Enrich with city names
    const locIds = [...new Set((rows || []).map(r => r.location_id).filter(Boolean))];
    const cityMap = {};
    if (locIds.length) {
      const locRes = await fetch(
        `${SUPABASE_URL}/rest/v1/landlord_locations?id=in.(${locIds.join(',')})&select=id,city&limit=100`,
        { headers: hdrs }
      );
      if (locRes.ok) {
        const locRows = await locRes.json();
        (locRows || []).forEach(l => { if (l.id && l.city) cityMap[l.id] = l.city; });
      }
    }

    const enriched = (rows || []).map(r => ({ ...r, city: r.location_id ? (cityMap[r.location_id] || '') : '' }));
    const cityFilter = city?.trim()?.toLowerCase();
    const filtered = cityFilter
      ? enriched.filter(r => !r.city || r.city.toLowerCase().includes(cityFilter))
      : enriched;
    const cities = [...new Set(enriched.map(r => r.city).filter(Boolean))].sort();

    return res.status(200).json({ ok: true, reports: filtered, cities, total: enriched.length });
  } catch (e) {
    console.error('REPORTS error:', e.message);
    return res.status(500).json({ error: e.message });
  }
}
