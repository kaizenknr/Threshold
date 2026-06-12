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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end('Method not allowed');

  let body = req.body;
  if (typeof body === 'string') try { body = JSON.parse(body); } catch (e) { body = {}; }
  body = body || {};

  const { name, location, force_refresh = false } = body;
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
        if (rows?.[0]) return res.json({ ok: true, score: rowToScore(rows[0]), _src: 'cache' });
      }
    } catch (e) { console.warn('Cache check:', e.message); }
  }

  const locationStr = location ? ` in ${location}` : '';

  const systemPrompt = `You are a rental housing transparency researcher. Search Reddit (r/renting, r/landlord, r/Tenant, r/FirstTimeRenting), ApartmentRatings.com, Yelp, and Google Reviews for real tenant experiences.
Focus on posts from 2022-2025. Look for: ghosting inquiries, hidden fees, mold/maintenance complaints, bait-and-switch listings, predatory application fees.
Return ONLY a valid JSON object — no markdown, no explanation.`;

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

  const score = {
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

  if (SUPABASE_URL && SUPABASE_SERVICE_KEY) {
    const expires = new Date(Date.now() + SCORE_TTL_MS).toISOString();
    const prefer = force_refresh ? 'resolution=merge-duplicates,return=minimal' : 'resolution=ignore-duplicates,return=minimal';
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/landlord_scores`, {
        method: 'POST',
        headers: { ...dbHeaders, Prefer: prefer },
        body: JSON.stringify({
          landlord_name: name.toLowerCase().trim(),
          overall_score: overall, ghost_rate: gr, response_rate: rr,
          hidden_fee_rate: hfr, mold_rate: mol, bait_switch_rate: bsr,
          app_fee_predatory: !!parsed.app_fee_predatory,
          avg_response_days: Math.round(rd), red_flag_score: redFlag,
          report_count: cnt, data_quality: score.data_quality,
          data_source: 'web_search', property_type: score.property_type,
          raw_summary: score.summary, web_reviews: reviews, expires_at: expires,
        }),
      });
    } catch (e) { console.error('Save error:', e.message); }
  }

  return res.json({ ok: true, score, _src: 'fresh' });
}
