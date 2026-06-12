// Tenant report fetch + submit
import {
  checkRateLimit, getClientIP, setCORSHeaders, setSecurityHeaders,
  filterUUIDs, parseBody,
} from './_security.js';

// Whitelists — backend enforces these regardless of what frontend sends
const VALID_OUTCOMES      = ['rented', 'passed', 'ghosted', 'fee_lost', 'looking', 'unknown'];
const VALID_UNIT_TYPES    = ['studio', '1br', '2br', '3br', '4br+', 'room', 'condo', 'townhouse', 'house', 'other', ''];
const VALID_PLATFORMS     = ['zillow', 'apartments.com', 'craigslist', 'facebook', 'hotpads', 'trulia', 'redfin', 'direct', 'other', ''];
const VALID_FEE_REFUNDED  = ['yes', 'no', 'partial', 'na'];
const VALID_ISSUES        = [
  'hidden_fees', 'listing_inaccurate', 'mold', 'maintenance_ignored',
  'predatory_app_fee', 'deposit_withheld', 'bait_switch', 'pressure_tactics',
  'unit_not_ready', 'no_response',
];

const normalize = n => n ? n.trim().toLowerCase()
  .replace(/[\s,]+(llc\.?|inc\.?|corp\.?|ltd\.?|co\.|properties|management|realty|group|apartments)\.?$/i, '')
  .trim() : '';

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
    Prefer: 'return=representation',
  };

  // ── Submit report ──────────────────────────────────────────────────────────
  if (body.action === 'submit') {
    // Rate limit: 15 reports per IP per hour (prevents spam flooding)
    const ip = getClientIP(req);
    if (!checkRateLimit(ip, 'report-submit', 15)) {
      return res.status(429).json({ error: 'Too many reports submitted. Please try again later.' });
    }

    const {
      landlord, address, city, unit_type, platform,
      outcome, issues, app_fee, app_fee_refunded, experience_text
    } = body;

    if (!landlord || !city) return res.status(400).json({ error: 'landlord and city required' });

    const safeLandlord = String(landlord).trim().slice(0, 200);
    const safeCity     = String(city).trim().slice(0, 200);
    const landlordNorm = normalize(safeLandlord);

    // Whitelist-validate enum fields
    const safeOutcome     = VALID_OUTCOMES.includes(outcome) ? outcome : 'unknown';
    const safeUnitType    = VALID_UNIT_TYPES.includes(unit_type) ? (unit_type || '') : '';
    const safePlatform    = VALID_PLATFORMS.includes(platform) ? (platform || '') : '';
    const safeFeeRefunded = VALID_FEE_REFUNDED.includes(app_fee_refunded) ? app_fee_refunded : 'na';
    const safeIssues      = Array.isArray(issues)
      ? issues.filter(i => VALID_ISSUES.includes(i)).slice(0, 10)
      : [];
    const safeAddress     = String(address || '').trim().slice(0, 300);
    const safeExpText     = String(experience_text || '').trim().slice(0, 2000);
    const safeAppFee      = app_fee ? Math.max(0, Math.min(99999, parseFloat(app_fee) || 0)) || null : null;

    // Find or create landlord record
    const word = encodeURIComponent(safeLandlord.split(/\s+/)[0]);
    let lid = null;
    try {
      const coSearch = await fetch(
        `${SUPABASE_URL}/rest/v1/landlords?name=ilike.*${word}*&select=id,name&limit=20`,
        { headers: hdrs, signal: AbortSignal.timeout(5000) }
      );
      const coRows = coSearch.ok ? await coSearch.json() : [];
      lid = (coRows || []).find(c => normalize(c.name) === landlordNorm)?.id || null;
    } catch (_e) {}

    if (!lid) {
      try {
        const insRes = await fetch(`${SUPABASE_URL}/rest/v1/landlords`, {
          method: 'POST', headers: hdrs, signal: AbortSignal.timeout(5000),
          body: JSON.stringify({ name: safeLandlord, logo_letter: safeLandlord[0]?.toUpperCase() || '?' })
        });
        if (insRes.ok) { const r = await insRes.json(); lid = Array.isArray(r) ? r[0]?.id : r?.id; }
      } catch (_e) {}
    }
    if (!lid) return res.status(500).json({ error: 'Could not save report. Please try again.' });

    // Find or create location record
    let locId = null;
    try {
      const locSearch = await fetch(
        `${SUPABASE_URL}/rest/v1/landlord_locations?landlord_id=eq.${lid}&city=ilike.${encodeURIComponent(safeCity)}&select=id&limit=1`,
        { headers: hdrs, signal: AbortSignal.timeout(5000) }
      );
      const locRows = locSearch.ok ? await locSearch.json() : [];
      locId = locRows?.[0]?.id || null;
    } catch (_e) {}

    if (!locId) {
      try {
        const locIns = await fetch(`${SUPABASE_URL}/rest/v1/landlord_locations`, {
          method: 'POST', headers: hdrs, signal: AbortSignal.timeout(5000),
          body: JSON.stringify({ landlord_id: lid, city: safeCity })
        });
        if (locIns.ok) { const lr = await locIns.json(); locId = Array.isArray(lr) ? lr[0]?.id : lr?.id; }
      } catch (_e) {}
    }

    const report = {
      landlord_id:      lid,
      landlord_name:    safeLandlord,
      location_id:      locId || null,
      address:          safeAddress,
      unit_type:        safeUnitType,
      platform:         safePlatform,
      outcome:          safeOutcome,
      issues:           safeIssues,
      app_fee:          safeAppFee,
      app_fee_refunded: safeFeeRefunded,
      experience_text:  safeExpText,
      source:           'direct',
    };

    try {
      const saveRes = await fetch(`${SUPABASE_URL}/rest/v1/apartment_reports`, {
        method: 'POST',
        headers: { ...hdrs, Prefer: 'return=minimal' },
        body: JSON.stringify(report),
        signal: AbortSignal.timeout(5000),
      });
      if (!saveRes.ok) {
        return res.status(500).json({ error: 'Could not save report. Please try again.' });
      }
    } catch (_e) {
      return res.status(500).json({ error: 'Could not save report. Please try again.' });
    }

    console.log(`REPORT SAVED: "${safeLandlord}" @ "${safeCity}" landlord_id:${lid}`);
    return res.status(200).json({ ok: true, landlord_id: lid });
  }

  // ── Fetch reports ──────────────────────────────────────────────────────────
  const { landlord, city } = body;
  if (!landlord) return res.status(400).json({ error: 'landlord required' });

  const canonical = normalize(String(landlord).trim().slice(0, 200));
  const firstWord = canonical.split(/\s+/)[0];
  const nameEnc   = encodeURIComponent(`*${firstWord}*`);

  try {
    const url = `${SUPABASE_URL}/rest/v1/apartment_reports`
      + `?landlord_name=ilike.${nameEnc}`
      + `&select=id,landlord_name,address,unit_type,outcome,issues,app_fee,app_fee_refunded,experience_text,platform,created_at,location_id`
      + `&order=created_at.desc`
      + `&limit=100`;

    const rRes = await fetch(url, { headers: hdrs, signal: AbortSignal.timeout(5000) });
    if (!rRes.ok) return res.status(200).json({ ok: true, reports: [], cities: [] });
    const rows = await rRes.json();

    // Enrich with city names — validate location IDs are UUIDs before querying
    const rawLocIds = [...new Set((rows || []).map(r => r.location_id).filter(Boolean))];
    const locIds = filterUUIDs(rawLocIds); // UUID validation prevents injection
    const cityMap = {};
    if (locIds.length) {
      const locRes = await fetch(
        `${SUPABASE_URL}/rest/v1/landlord_locations?id=in.(${locIds.join(',')})&select=id,city&limit=100`,
        { headers: hdrs, signal: AbortSignal.timeout(5000) }
      );
      if (locRes.ok) {
        const locRows = await locRes.json();
        (locRows || []).forEach(l => { if (l.id && l.city) cityMap[l.id] = l.city; });
      }
    }

    const enriched = (rows || []).map(r => ({ ...r, city: r.location_id ? (cityMap[r.location_id] || '') : '' }));
    const cityFilter = String(city || '').trim().toLowerCase().slice(0, 100);
    const filtered = cityFilter
      ? enriched.filter(r => !r.city || r.city.toLowerCase().includes(cityFilter))
      : enriched;
    const cities = [...new Set(enriched.map(r => r.city).filter(Boolean))].sort();

    return res.status(200).json({ ok: true, reports: filtered, cities, total: enriched.length });
  } catch (e) {
    console.error('REPORTS error:', e.message);
    return res.status(500).json({ error: 'Could not load reports. Please try again.' });
  }
}
