import {
  checkRateLimit, getClientIP, setCORSHeaders, setSecurityHeaders,
  sanitizeForPrompt, sanitizeArrayForPrompt, parseBody,
} from './_security.js';

const SCORE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

// ─── Score calculation ────────────────────────────────────────────────────
function calcTransparencyScore(responseRate, ghostRate, hiddenFeeRate, reportCount) {
  return Math.max(0, Math.min(100, Math.round(
    50 + (responseRate * 40) + (ghostRate * -30) + (hiddenFeeRate * -15) + (Math.log(reportCount + 1) * 5)
  )));
}

function calcRedFlagScore(ghostRate, moldRate, hiddenFeeRate, baitSwitchRate) {
  return Math.max(0, Math.min(100, Math.round(
    ghostRate * 30 + moldRate * 35 + hiddenFeeRate * 25 + baitSwitchRate * 20
  )));
}

function rowToScore(row) {
  let reviews = [];
  if (row.web_reviews) {
    try { reviews = typeof row.web_reviews === 'string' ? JSON.parse(row.web_reviews) : row.web_reviews; } catch (_e) {}
  }
  return {
    overall_score: row.overall_score,
    ghost_rate: row.ghost_rate,
    response_rate: row.response_rate,
    hidden_fee_rate: row.hidden_fee_rate,
    mold_rate: row.mold_rate,
    bait_switch_rate: row.bait_switch_rate,
    app_fee_predatory: row.app_fee_predatory,
    avg_response_days: row.avg_response_days,
    red_flag_score: row.red_flag_score,
    report_count: row.report_count || 0,
    data_quality: row.data_quality || 'medium',
    data_source: 'web_research',
    risk_level: row.overall_score >= 70 ? 'safe' : row.overall_score >= 40 ? 'warn' : 'danger',
    property_type: row.property_type || '',
    summary: row.raw_summary || '',
    web_reviews: reviews,
  };
}

function isLA(location) {
  const l = (location || '').toLowerCase();
  return l.includes('los angeles') || l === 'la' || l === 'l.a.' || l.includes(', la') || l.includes(',la');
}

// ─── Government data helpers ───────────────────────────────────────────────
async function fetchLAHDViolations(name, location) {
  if (!isLA(location)) return [];
  const nameQ = encodeURIComponent('%' + name.trim().split(' ')[0] + '%');
  try {
    const r = await fetch(
      `https://data.lacity.org/resource/tfm3-xwcm.json?$where=landlord_name+like+%27${nameQ}%27&$limit=8&$order=date_case_opened+DESC`,
      { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(6000) }
    );
    if (!r.ok) return [];
    const rows = await r.json();
    return rows.slice(0, 8).map(v => ({
      case_number: String(v.case_number || '').slice(0, 50),
      address:     String(v.address || v.apc_area || '').slice(0, 200),
      description: String(v.violation_description || v.violation_category || v.case_type || '').slice(0, 200),
      status:      String(v.status || v.case_status || '').slice(0, 50),
      opened:      String(v.date_case_opened || v.date_case_created || '').slice(0, 30),
      closed:      String(v.date_case_closed || '').slice(0, 30),
    }));
  } catch (_e) { return []; }
}

async function fetchBuildingPermits(name, location) {
  if (!isLA(location)) return [];
  const ownerQ = encodeURIComponent('%' + name.trim().split(' ')[0].toUpperCase() + '%');
  try {
    const r = await fetch(
      `https://data.lacity.org/resource/nbyu-2ntv.json?$where=upper(owner_name)+like+%27${ownerQ}%27&$limit=6&$order=issue_date+DESC`,
      { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(6000) }
    );
    if (!r.ok) return [];
    const rows = await r.json();
    return rows.slice(0, 6).map(p => ({
      permit_number: String(p.permit_nbr || p.permit_number || '').slice(0, 50),
      type:          String(p.permit_type || p.permit_sub_type || '').slice(0, 80),
      address:       String(p.address || '').slice(0, 200),
      status:        String(p.latest_status || p.status || '').slice(0, 50),
      issued:        String(p.issue_date || '').slice(0, 30),
      description:   String(p.work_description || '').slice(0, 120),
    }));
  } catch (_e) { return []; }
}

async function fetchOpenCorporates(name) {
  try {
    const q = encodeURIComponent(name.trim());
    const r = await fetch(
      `https://api.opencorporates.com/v0.4/companies/search?q=${q}&jurisdiction_code=us_ca&per_page=3`,
      { headers: { Accept: 'application/json', 'User-Agent': 'Threshold/1.0 rental-transparency' }, signal: AbortSignal.timeout(5000) }
    );
    if (!r.ok) return null;
    const d = await r.json();
    const companies = d?.results?.companies;
    if (!companies?.length) return null;
    return companies.slice(0, 3).map(c => {
      const co = c.company;
      return {
        name:               String(co.name || '').slice(0, 200),
        type:               String(co.company_type || '').slice(0, 80),
        status:             String(co.current_status || '').slice(0, 80),
        incorporated:       String(co.incorporation_date || '').slice(0, 30),
        inactive:           co.inactive === true,
        registered_address: String(co.registered_address_in_full || '').slice(0, 300),
        jurisdiction:       String(co.jurisdiction_code || '').slice(0, 20),
      };
    });
  } catch (_e) { return null; }
}

// ─── Main handler ──────────────────────────────────────────────────────────
export default async function handler(req, res) {
  setCORSHeaders(req, res);
  setSecurityHeaders(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end('Method not allowed');

  // Rate limit: 10 scored searches per IP per hour (Claude is expensive)
  const ip = getClientIP(req);
  if (!checkRateLimit(ip, 'score', 10)) {
    return res.status(429).json({ error: 'Too many requests. Try again later.' });
  }

  const body = parseBody(req);
  const rawName = body.name;
  if (!rawName) return res.status(400).json({ error: 'name required' });

  // Sanitize all user inputs before any external use
  const name     = sanitizeForPrompt(rawName, 200);
  const location = sanitizeForPrompt(body.location || '', 150);
  const renter_type   = sanitizeForPrompt(body.renter_type || '', 50);
  const concerns      = sanitizeArrayForPrompt(body.concerns, 5, 60);
  const looking_for   = sanitizeArrayForPrompt(body.looking_for, 5, 60);
  const force_refresh = body.force_refresh === true;

  if (!name) return res.status(400).json({ error: 'name required' });

  const SUPABASE_URL     = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  const ANTHROPIC_KEY    = process.env.ANTHROPIC_KEY;
  if (!ANTHROPIC_KEY) return res.status(500).json({ error: 'Service unavailable' });

  const dbHeaders = {
    apikey: SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
    'Content-Type': 'application/json',
  };

  // ── Cache lookup ──────────────────────────────────────────────────────────
  let aiScore = null;
  let fromCache = false;
  if (!force_refresh && SUPABASE_URL && SUPABASE_SERVICE_KEY) {
    try {
      const now = encodeURIComponent(new Date().toISOString());
      const nameEnc = encodeURIComponent(name.toLowerCase().trim());
      const cacheRes = await fetch(
        `${SUPABASE_URL}/rest/v1/landlord_scores?landlord_name=ilike.${nameEnc}&expires_at=gt.${now}&order=created_at.desc&limit=1`,
        { headers: dbHeaders, signal: AbortSignal.timeout(4000) }
      );
      if (cacheRes.ok) {
        const rows = await cacheRes.json();
        if (rows?.[0]) { aiScore = rowToScore(rows[0]); fromCache = true; }
      }
    } catch (e) { console.warn('Cache check:', e.message); }
  }

  // ── Fresh AI research ─────────────────────────────────────────────────────
  if (!aiScore) {
    const locationStr = location ? ` in ${location}` : '';
    const profileNote = renter_type
      ? `\nRenter context: ${renter_type}. Looking for: ${looking_for.join(', ') || 'a rental'}. Top concerns: ${concerns.join(', ') || 'general quality'}.`
      : '';

    const systemPrompt = `You are a rental housing transparency researcher. Search Reddit (r/renting, r/landlord, r/Tenant, r/FirstTimeRenting), ApartmentRatings.com, Yelp, and Google Reviews for real tenant experiences.
Focus on posts from 2022-2025. Look for: ghosting inquiries, hidden fees, mold/maintenance complaints, bait-and-switch listings, predatory application fees.
Return ONLY a valid JSON object — no markdown, no explanation.${profileNote}`;

    const userPrompt = `Research tenant experiences with landlord or property manager "${name}"${locationStr}.

Search for: ghosting after inquiry, hidden fees discovered at signing or move-in, mold or maintenance issues never addressed, listing photos not matching reality, non-refundable application fees charged without renting, security deposit never returned, pressure tactics.

Count evidence: how many posts mention ghosting vs responses? Hidden fees? Mold?

Find 4-6 specific quotes or close paraphrases from real tenants on Reddit, ApartmentRatings, Yelp, or Google Reviews (2022-2025).

Return ONLY this JSON:
{
  "ghost_rate": 0.0-1.0,
  "response_rate": 0.0-1.0,
  "hidden_fee_rate": 0.0-1.0,
  "mold_rate": 0.0-1.0,
  "bait_switch_rate": 0.0-1.0,
  "app_fee_predatory": true or false,
  "avg_response_days": 1-60,
  "report_count": number_of_community_posts_found,
  "data_quality": "high" or "medium" or "low",
  "property_type": "e.g. Apartment complex, Single-family, Condo",
  "summary": "2-3 sentences describing what tenants actually experience",
  "reviews": [
    {
      "text": "exact quote or close paraphrase",
      "sentiment": "positive" or "negative" or "mixed",
      "source": "Reddit r/renting" or "ApartmentRatings" or "Yelp" etc,
      "year": "2024"
    }
  ]
}`;

    let apiRes;
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) await new Promise(r => setTimeout(r, attempt * 4000));
      apiRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_KEY,
          'anthropic-version': '2023-06-01',
          'anthropic-beta': 'web-search-2025-03-05',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 2000,
          tools: [{ type: 'web_search_20250305', name: 'web_search' }],
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
        }),
        signal: AbortSignal.timeout(42000), // stay under Vercel's 45s limit
      });
      if (apiRes.status !== 429 && apiRes.status !== 529) break;
    }

    if (!apiRes.ok) {
      return res.status(502).json({ error: 'Research service unavailable. Try again shortly.' });
    }

    const data = await apiRes.json();
    const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');

    let parsed;
    try {
      const clean = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const match = clean.match(/\{[\s\S]*\}/);
      if (!match) throw new Error('no JSON found');
      parsed = JSON.parse(match[0]);
    } catch (e) {
      return res.status(502).json({ error: 'Could not parse research results. Try again.' });
    }

    const gr  = Math.max(0, Math.min(1, Number(parsed.ghost_rate)       || 0));
    const rr  = Math.max(0, Math.min(1, Number(parsed.response_rate)    || 0));
    const hfr = Math.max(0, Math.min(1, Number(parsed.hidden_fee_rate)  || 0));
    const mol = Math.max(0, Math.min(1, Number(parsed.mold_rate)        || 0));
    const bsr = Math.max(0, Math.min(1, Number(parsed.bait_switch_rate) || 0));
    const rd  = Math.max(1, Math.min(60, Number(parsed.avg_response_days) || 7));
    const cnt = Math.max(1, Number(parsed.report_count) || 5);
    const overall = calcTransparencyScore(rr, gr, hfr, cnt);
    const redFlag = calcRedFlagScore(gr, mol, hfr, bsr);

    // Sanitize Claude's output before storing/returning
    const reviews = Array.isArray(parsed.reviews) ? parsed.reviews.slice(0, 6).map(r => ({
      text:      String(r.text   || '').slice(0, 400),
      sentiment: ['positive', 'negative', 'mixed'].includes(r.sentiment) ? r.sentiment : 'mixed',
      source:    String(r.source || '').slice(0, 80),
      year:      String(r.year   || '').slice(0, 4).replace(/[^0-9]/g, ''),
    })) : [];

    aiScore = {
      overall_score: overall, ghost_rate: gr, response_rate: rr,
      hidden_fee_rate: hfr, mold_rate: mol, bait_switch_rate: bsr,
      app_fee_predatory: !!parsed.app_fee_predatory,
      avg_response_days: Math.round(rd), red_flag_score: redFlag,
      report_count: cnt,
      data_quality: ['high', 'medium', 'low'].includes(parsed.data_quality) ? parsed.data_quality : 'medium',
      data_source: 'web_research',
      risk_level: overall >= 70 ? 'safe' : overall >= 40 ? 'warn' : 'danger',
      property_type: String(parsed.property_type || '').slice(0, 80),
      summary:       String(parsed.summary       || '').slice(0, 500),
      web_reviews:   reviews,
    };

    // Cache the AI score
    if (SUPABASE_URL && SUPABASE_SERVICE_KEY) {
      const expires = new Date(Date.now() + SCORE_TTL_MS).toISOString();
      const prefer = force_refresh ? 'resolution=merge-duplicates,return=minimal' : 'resolution=ignore-duplicates,return=minimal';
      fetch(`${SUPABASE_URL}/rest/v1/landlord_scores`, {
        method: 'POST',
        headers: { ...dbHeaders, Prefer: prefer },
        body: JSON.stringify({
          landlord_name: name.toLowerCase().trim(),
          overall_score: overall, ghost_rate: gr, response_rate: rr,
          hidden_fee_rate: hfr, mold_rate: mol, bait_switch_rate: bsr,
          app_fee_predatory: !!parsed.app_fee_predatory,
          avg_response_days: Math.round(rd), red_flag_score: redFlag,
          report_count: cnt, data_quality: aiScore.data_quality,
          data_source: 'web_search', property_type: aiScore.property_type,
          raw_summary: aiScore.summary, web_reviews: reviews, expires_at: expires,
        }),
      }).catch(e => console.error('Cache save:', e.message));
    }
  }

  // ── Government data (always fresh, fast, free) ─────────────────────────────
  const [lahdRes, permitsRes, corpRes, hudRes] = await Promise.allSettled([
    fetchLAHDViolations(name, location),
    fetchBuildingPermits(name, location),
    fetchOpenCorporates(name),
    (async () => {
      const hudToken = process.env.HUD_API_TOKEN;
      if (!hudToken) return null;
      const r = await fetch(
        `https://api.hud.gov/api/multifamily_inspections/search?name=${encodeURIComponent(name.trim())}&limit=1`,
        { headers: { Authorization: `Bearer ${hudToken}` }, signal: AbortSignal.timeout(5000) }
      );
      if (!r.ok) return null;
      const hd = await r.json();
      return hd?.results?.[0] || null;
    })(),
  ]);

  const score = {
    ...aiScore,
    lahd_violations:  lahdRes.status  === 'fulfilled' ? lahdRes.value  : [],
    building_permits: permitsRes.status === 'fulfilled' ? permitsRes.value : [],
    business_info:    corpRes.status   === 'fulfilled' ? corpRes.value   : null,
    hud_inspection:   hudRes.status    === 'fulfilled' ? hudRes.value    : null,
  };

  return res.json({ ok: true, score, _src: fromCache ? 'cache' : 'fresh' });
}
