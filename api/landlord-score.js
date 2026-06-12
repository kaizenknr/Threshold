const SCORE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

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

async function fetchLAHDViolations(name, location) {
  if (!isLA(location)) return [];
  const nameQ = encodeURIComponent('%' + name.trim().split(' ')[0] + '%');
  const r = await fetch(
    `https://data.lacity.org/resource/tfm3-xwcm.json?$where=landlord_name+like+%27${nameQ}%27&$limit=8&$order=date_case_opened+DESC`,
    { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(6000) }
  );
  if (!r.ok) return [];
  const rows = await r.json();
  return rows.slice(0, 8).map(v => ({
    case_number: v.case_number || '',
    address: v.address || v.apc_area || '',
    description: v.violation_description || v.violation_category || v.case_type || '',
    status: v.status || v.case_status || '',
    opened: v.date_case_opened || v.date_case_created || '',
    closed: v.date_case_closed || '',
  }));
}

async function fetchBuildingPermits(name, location) {
  if (!isLA(location)) return [];
  // Search LA City Building & Safety permits by owner name
  const ownerQ = encodeURIComponent('%' + name.trim().split(' ')[0].toUpperCase() + '%');
  const r = await fetch(
    `https://data.lacity.org/resource/nbyu-2ntv.json?$where=upper(owner_name)+like+%27${ownerQ}%27&$limit=6&$order=issue_date+DESC`,
    { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(6000) }
  );
  if (!r.ok) return [];
  const rows = await r.json();
  return rows.slice(0, 6).map(p => ({
    permit_number: p.permit_nbr || p.permit_number || '',
    type: p.permit_type || p.permit_sub_type || '',
    address: p.address || '',
    status: p.latest_status || p.status || '',
    issued: p.issue_date || '',
    description: (p.work_description || '').slice(0, 120),
  }));
}

async function fetchOpenCorporates(name) {
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
      name: co.name || '',
      type: co.company_type || '',
      status: co.current_status || '',
      incorporated: co.incorporation_date || '',
      inactive: co.inactive === true,
      registered_address: co.registered_address_in_full || '',
      jurisdiction: co.jurisdiction_code || '',
    };
  });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end('Method not allowed');

  let body = req.body;
  if (typeof body === 'string') try { body = JSON.parse(body); } catch (e) { body = {}; }
  body = body || {};

  const { name, location, force_refresh = false, renter_type, concerns, looking_for } = body;
  if (!name) return res.status(400).json({ error: 'name required' });

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  const ANTHROPIC_KEY = process.env.ANTHROPIC_KEY;
  if (!ANTHROPIC_KEY) return res.status(500).json({ error: 'ANTHROPIC_KEY missing' });

  const dbHeaders = {
    apikey: SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
    'Content-Type': 'application/json',
  };

  // Try cache for AI score
  let aiScore = null;
  let fromCache = false;
  if (!force_refresh && SUPABASE_URL && SUPABASE_SERVICE_KEY) {
    try {
      const now = encodeURIComponent(new Date().toISOString());
      const nameEnc = encodeURIComponent(name.toLowerCase().trim());
      const cacheRes = await fetch(
        `${SUPABASE_URL}/rest/v1/landlord_scores?landlord_name=ilike.${nameEnc}&expires_at=gt.${now}&order=created_at.desc&limit=1`,
        { headers: dbHeaders }
      );
      if (cacheRes.ok) {
        const rows = await cacheRes.json();
        if (rows?.[0]) { aiScore = rowToScore(rows[0]); fromCache = true; }
      }
    } catch (e) { console.warn('Cache check:', e.message); }
  }

  // Fetch AI score fresh if not cached
  if (!aiScore) {
    const locationStr = location ? ` in ${location}` : '';
    const profileNote = renter_type ? `\nThe renter is: ${renter_type}. They are looking for: ${(looking_for||[]).join(', ')||'a rental'}. Their top concerns are: ${(concerns||[]).join(', ')||'general quality'}. Weight your research and scoring to reflect what matters most for this renter type.` : '';

    const systemPrompt = `You are a rental housing transparency researcher. Search Reddit (r/renting, r/landlord, r/Tenant, r/FirstTimeRenting), ApartmentRatings.com, Yelp, and Google Reviews for real tenant experiences.
Focus on posts from 2022-2025. Look for: ghosting inquiries, hidden fees, mold/maintenance complaints, bait-and-switch listings, predatory application fees.
Return ONLY a valid JSON object — no markdown, no explanation.${profileNote}`;

    const userPrompt = `Research tenant experiences with landlord or property manager "${name}"${locationStr}.

Search for: ghosting after inquiry, hidden fees discovered at signing or move-in, mold or maintenance issues never addressed, listing photos not matching reality, non-refundable application fees charged without renting, security deposit never returned, pressure tactics.

Count evidence: how many posts mention ghosting vs responses? Hidden fees? Mold?

Find 4-6 specific quotes or close paraphrases from real tenants on Reddit, ApartmentRatings, Yelp, or Google Reviews (2022-2025).

Return ONLY this JSON:${profileNote}
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
        })
      });
      if (apiRes.status !== 429 && apiRes.status !== 529) break;
    }

    if (!apiRes.ok) {
      const err = await apiRes.text();
      return res.status(502).json({ error: 'Claude API error', detail: err.slice(0, 150) });
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
      return res.status(502).json({ error: 'Could not parse response', raw: text.slice(0, 200) });
    }

    const gr  = Math.max(0, Math.min(1, Number(parsed.ghost_rate)      || 0));
    const rr  = Math.max(0, Math.min(1, Number(parsed.response_rate)   || 0));
    const hfr = Math.max(0, Math.min(1, Number(parsed.hidden_fee_rate) || 0));
    const mol = Math.max(0, Math.min(1, Number(parsed.mold_rate)       || 0));
    const bsr = Math.max(0, Math.min(1, Number(parsed.bait_switch_rate)|| 0));
    const rd  = Math.max(1, Math.min(60, Number(parsed.avg_response_days) || 7));
    const cnt = Math.max(1, Number(parsed.report_count) || 5);
    const overall = calcTransparencyScore(rr, gr, hfr, cnt);
    const redFlag = calcRedFlagScore(gr, mol, hfr, bsr);

    const reviews = Array.isArray(parsed.reviews) ? parsed.reviews.slice(0, 6).map(r => ({
      text:      (r.text   || '').slice(0, 400),
      sentiment: ['positive', 'negative', 'mixed'].includes(r.sentiment) ? r.sentiment : 'mixed',
      source:    (r.source || '').slice(0, 80),
      year:      (r.year   || '').slice(0, 4),
    })) : [];

    aiScore = {
      overall_score: overall, ghost_rate: gr, response_rate: rr,
      hidden_fee_rate: hfr, mold_rate: mol, bait_switch_rate: bsr,
      app_fee_predatory: !!parsed.app_fee_predatory,
      avg_response_days: Math.round(rd), red_flag_score: redFlag,
      report_count: cnt, data_quality: parsed.data_quality || 'medium',
      data_source: 'web_research',
      risk_level: overall >= 70 ? 'safe' : overall >= 40 ? 'warn' : 'danger',
      property_type: (parsed.property_type || '').slice(0, 80),
      summary: (parsed.summary || '').slice(0, 500),
      web_reviews: reviews,
    };

    // Save to cache
    if (SUPABASE_URL && SUPABASE_SERVICE_KEY) {
      const expires = new Date(Date.now() + SCORE_TTL_MS).toISOString();
      const prefer = force_refresh ? 'resolution=merge-duplicates,return=minimal' : 'resolution=ignore-duplicates,return=minimal';
      try {
        await fetch(`${SUPABASE_URL}/rest/v1/landlord_scores`, {
          method: 'POST',
          headers: { ...dbHeaders, Prefer: prefer },
          body: JSON.stringify({
            landlord_name: name.toLowerCase().trim(),
            overall_score: aiScore.overall_score, ghost_rate: gr, response_rate: rr,
            hidden_fee_rate: hfr, mold_rate: mol, bait_switch_rate: bsr,
            app_fee_predatory: !!parsed.app_fee_predatory,
            avg_response_days: Math.round(rd), red_flag_score: redFlag,
            report_count: cnt, data_quality: aiScore.data_quality,
            data_source: 'web_search', property_type: aiScore.property_type,
            raw_summary: aiScore.summary, web_reviews: reviews, expires_at: expires,
          }),
        });
      } catch (e) { console.error('Save error:', e.message); }
    }
  }

  // Government data lookups — always run fresh (fast, free, reflects current records)
  const [lahdRes, permitsRes, corpRes, hudRes] = await Promise.allSettled([
    fetchLAHDViolations(name, location),
    fetchBuildingPermits(name, location),
    fetchOpenCorporates(name),
    (async () => {
      const hudToken = process.env.HUD_API_TOKEN;
      if (!hudToken) return null;
      const hudName = encodeURIComponent(name.trim());
      const r = await fetch(`https://api.hud.gov/api/multifamily_inspections/search?name=${hudName}&limit=1`, {
        headers: { Authorization: `Bearer ${hudToken}` },
        signal: AbortSignal.timeout(5000),
      });
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
