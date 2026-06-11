// =============================================================================
// THRESHOLD BACKEND — src/server.js
// Express + Supabase (PostgreSQL managed by Supabase)
// =============================================================================

import express         from 'express';
import cors            from 'cors';
import helmet          from 'helmet';
import rateLimit       from 'express-rate-limit';
import { createClient } from '@supabase/supabase-js';
import { z }           from 'zod';
import crypto          from 'crypto';
import cron            from 'node-cron';

// ── Supabase client ───────────────────────────────────────────────────────────
// Uses the SERVICE ROLE key (server-side only, never sent to browser)
export const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ── App setup ─────────────────────────────────────────────────────────────────
const app = express();

app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:5173']
}));
app.use(express.json({ limit: '2mb' }));

// Rate limiting (no Redis needed — in-memory for now, upgrade later)
const limiter = rateLimit({ windowMs: 60_000, max: 60, standardHeaders: true });
const strictLimiter = rateLimit({ windowMs: 60_000, max: 10 });
app.use('/api/', limiter);
app.use('/api/reviews', strictLimiter);


// =============================================================================
// ROUTES
// =============================================================================

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));


// ── Search properties ─────────────────────────────────────────────────────────
app.get('/api/search', async (req, res) => {
  try {
    const { q, city, zip, min_price, max_price, bedrooms, sort = 'risk_asc', limit = 20, offset = 0 } = req.query;

    if (!q && !city && !zip) {
      return res.status(400).json({ error: 'Provide q, city, or zip' });
    }

    // Use Supabase RPC for fuzzy search (calls a SQL function we define in migrations)
    const { data, error } = await supabase
      .rpc('search_properties', {
        search_query:  q || '',
        filter_city:   city || '',
        filter_zip:    zip || '',
        filter_beds:   bedrooms ? parseInt(bedrooms) : null,
        min_rent:      min_price ? parseInt(min_price) : null,
        max_rent:      max_price ? parseInt(max_price) : null,
        sort_by:       sort,
        page_limit:    parseInt(limit),
        page_offset:   parseInt(offset),
      });

    if (error) throw error;
    res.json({ data: data || [], limit: parseInt(limit), offset: parseInt(offset) });

  } catch (err) {
    console.error('Search error:', err);
    res.status(500).json({ error: 'Search failed' });
  }
});


// ── Property detail ───────────────────────────────────────────────────────────
app.get('/api/properties/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Fetch all related data in parallel
    const [propRes, timelineRes, reviewsRes, violationsRes, feesRes, evictionsRes, pricesRes, riskRes] = await Promise.all([
      supabase.from('v_property_card').select('*').eq('id', id).single(),
      supabase.from('property_timeline').select('*').eq('property_id', id).eq('is_public', true).order('event_date', { ascending: false }).limit(50),
      supabase.from('tenant_reviews').select('id, tenancy_start, tenancy_end, unit_number, score_overall, score_fee_transparency, score_maintenance, score_conduct, score_price_accuracy, score_habitability, headline, body, advertised_rent, actual_rent, renewal_hike_pct, verified_tenant, helpful_count, created_at').eq('property_id', id).eq('status', 'approved').order('helpful_count', { ascending: false }).limit(20),
      supabase.from('violations').select('violation_type, category, description, severity, status, source_agency, case_number, issued_date, resolved_date, fine_amount').eq('property_id', id).order('issued_date', { ascending: false }),
      supabase.rpc('get_fee_summary', { prop_id: id }),
      supabase.from('eviction_records').select('case_number, filing_date, outcome, eviction_reason, amount_claimed').eq('property_id', id).order('filing_date', { ascending: false }),
      supabase.rpc('get_price_history', { prop_id: id }),
      supabase.from('risk_assessments').select('*').eq('property_id', id).order('computed_at', { ascending: false }).limit(1).single(),
    ]);

    if (propRes.error || !propRes.data) {
      return res.status(404).json({ error: 'Property not found' });
    }

    res.json({
      ...propRes.data,
      timeline:   timelineRes.data  || [],
      reviews:    reviewsRes.data   || [],
      violations: violationsRes.data || [],
      fees:       feesRes.data      || [],
      evictions:  evictionsRes.data || [],
      prices:     pricesRes.data    || [],
      risk:       riskRes.data      || null,
    });

  } catch (err) {
    console.error('Property detail error:', err);
    res.status(500).json({ error: 'Failed to load property' });
  }
});


// ── Property timeline ─────────────────────────────────────────────────────────
app.get('/api/properties/:id/timeline', async (req, res) => {
  try {
    const { id } = req.params;
    const { category, limit = 30, offset = 0 } = req.query;

    let query = supabase
      .from('property_timeline')
      .select('id, event_type, event_category, severity, title, description, amount, amount_previous, pct_change, event_date, event_date_end, icon, source')
      .eq('property_id', id)
      .eq('is_public', true)
      .order('event_date', { ascending: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    if (category && category !== 'all') {
      query = query.eq('event_category', category);
    }

    const { data, error } = await query;
    if (error) throw error;
    res.json({ data: data || [], limit: parseInt(limit), offset: parseInt(offset) });

  } catch (err) {
    console.error('Timeline error:', err);
    res.status(500).json({ error: 'Failed to load timeline' });
  }
});


// ── Landlord detail ───────────────────────────────────────────────────────────
app.get('/api/landlords/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const [landlordRes, propsRes, feesRes, violationsRes] = await Promise.all([
      supabase.from('v_landlord_portfolio').select('*').eq('id', id).single(),
      supabase.from('properties').select('id, canonical_address, city, zip, risk_score, bedrooms, property_type').eq('owner_id', id),
      supabase.rpc('get_landlord_fee_summary', { land_id: id }),
      supabase.from('violations').select('violation_type, count').eq('landlord_id', id),
    ]);

    if (landlordRes.error || !landlordRes.data) {
      return res.status(404).json({ error: 'Landlord not found' });
    }

    res.json({
      ...landlordRes.data,
      properties: propsRes.data  || [],
      fees:       feesRes.data   || [],
      violations: violationsRes.data || [],
    });

  } catch (err) {
    console.error('Landlord error:', err);
    res.status(500).json({ error: 'Failed to load landlord' });
  }
});


// ── Neighborhood stats ────────────────────────────────────────────────────────
app.get('/api/neighborhoods/:geoType/:geoId', async (req, res) => {
  try {
    const { geoType, geoId } = req.params;

    const [statsRes, topRiskRes, rentTrendRes] = await Promise.all([
      supabase.from('neighborhood_stats').select('*').eq('geo_type', geoType).eq('geo_id', geoId).order('computed_at', { ascending: false }).limit(1).single(),
      supabase.rpc('get_top_risk_properties', { geo_type_param: geoType, geo_id_param: geoId, result_limit: 5 }),
      supabase.rpc('get_rent_trend', { geo_type_param: geoType, geo_id_param: geoId }),
    ]);

    res.json({
      stats:     statsRes.data    || null,
      topRisk:   topRiskRes.data  || [],
      rentTrend: rentTrendRes.data || [],
    });

  } catch (err) {
    console.error('Neighborhood error:', err);
    res.status(500).json({ error: 'Failed to load neighborhood' });
  }
});


// ── Submit review ─────────────────────────────────────────────────────────────
const ReviewSchema = z.object({
  property_id:             z.string().uuid(),
  tenancy_start:           z.string().optional(),
  tenancy_end:             z.string().optional(),
  unit_number:             z.string().optional(),
  is_current_tenant:       z.boolean().default(false),
  score_overall:           z.number().min(1).max(10),
  score_fee_transparency:  z.number().min(1).max(10),
  score_maintenance:       z.number().min(1).max(10),
  score_conduct:           z.number().min(1).max(10),
  score_price_accuracy:    z.number().min(1).max(10),
  score_habitability:      z.number().min(1).max(10),
  headline:                z.string().max(120).optional(),
  body:                    z.string().min(20).max(2000),
  advertised_rent:         z.number().int().optional(),
  actual_rent:             z.number().int().optional(),
  renewal_hike_pct:        z.number().optional(),
  fee_reports: z.array(z.object({
    fee_type:          z.string(),
    amount:            z.number().int().optional(),
    refundable:        z.boolean().optional(),
    disclosed_upfront: z.boolean().optional(),
    description:       z.string().optional(),
  })).optional().default([]),
});

app.post('/api/reviews', async (req, res) => {
  const parsed = ReviewSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues });
  }

  const data = parsed.data;

  // One-way hash for spam detection only — never stored with review content
  const submitterHash = crypto
    .createHash('sha256')
    .update(`${req.ip}:${req.headers['user-agent']}:${process.env.HASH_SALT || 'dev'}`)
    .digest('hex');

  try {
    // Get current owner
    const { data: ownership } = await supabase
      .from('ownership_records')
      .select('landlord_id')
      .eq('property_id', data.property_id)
      .eq('is_current', true)
      .single();

    // Insert review
    const { data: review, error: reviewError } = await supabase
      .from('tenant_reviews')
      .insert({
        property_id:             data.property_id,
        landlord_id:             ownership?.landlord_id || null,
        submitter_hash:          submitterHash,
        tenancy_start:           data.tenancy_start || null,
        tenancy_end:             data.tenancy_end || null,
        unit_number:             data.unit_number || null,
        is_current_tenant:       data.is_current_tenant,
        score_overall:           data.score_overall,
        score_fee_transparency:  data.score_fee_transparency,
        score_maintenance:       data.score_maintenance,
        score_conduct:           data.score_conduct,
        score_price_accuracy:    data.score_price_accuracy,
        score_habitability:      data.score_habitability,
        headline:                data.headline || null,
        body:                    data.body,
        advertised_rent:         data.advertised_rent || null,
        actual_rent:             data.actual_rent || null,
        renewal_hike_pct:        data.renewal_hike_pct || null,
        status:                  'pending',
      })
      .select('id')
      .single();

    if (reviewError) throw reviewError;

    // Insert fee reports
    if (data.fee_reports?.length) {
      await supabase.from('fee_reports').insert(
        data.fee_reports.map(f => ({
          property_id:       data.property_id,
          landlord_id:       ownership?.landlord_id || null,
          review_id:         review.id,
          fee_type:          f.fee_type,
          amount:            f.amount || null,
          refundable:        f.refundable ?? null,
          disclosed_upfront: f.disclosed_upfront ?? null,
          description:       f.description || null,
        }))
      );
    }

    res.status(201).json({ id: review.id, status: 'pending', message: 'Review submitted for moderation.' });

  } catch (err) {
    console.error('Review submission error:', err);
    res.status(500).json({ error: 'Submission failed. Please try again.' });
  }
});


// =============================================================================
// BACKGROUND JOBS
// =============================================================================

// Refresh HUD FMR data — runs 1st of every month at midnight
cron.schedule('0 0 1 * *', async () => {
  console.log('[cron] Refreshing HUD FMR data...');
  const zips = ['90010','90013','90015','90016','90020','90026','90027','90703'];
  for (const zip of zips) {
    try {
      const res = await fetch(`https://www.huduser.gov/hudapi/public/fmr/byzip/${zip}`, {
        headers: { Authorization: `Bearer ${process.env.HUD_API_TOKEN}` }
      });
      const json = await res.json();
      if (json?.data?.basicdata) {
        const b = json.data.basicdata;
        await supabase.from('hud_fmr').upsert({
          zip, year: parseInt(b.year || new Date().getFullYear()),
          fmr_0br: b.Efficiency, fmr_1br: b['One-Bedroom'],
          fmr_2br: b['Two-Bedroom'], fmr_3br: b['Three-Bedroom'],
          fmr_4br: b['Four-Bedroom'], metro_name: b.metro_name,
        }, { onConflict: 'zip,year' });
      }
    } catch (e) { console.warn(`[cron] HUD FMR failed for ${zip}:`, e.message); }
  }
});

// Refresh neighborhood stats — nightly at 2am
cron.schedule('0 2 * * *', async () => {
  console.log('[cron] Recomputing neighborhood stats...');
  await supabase.rpc('refresh_neighborhood_stats');
});

// Refresh landlord aggregates — every hour at :30
cron.schedule('30 * * * *', async () => {
  await supabase.rpc('refresh_landlord_aggregates');
});


// =============================================================================
// START
// =============================================================================
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Threshold API running on port ${PORT}`);
  console.log(`Supabase URL: ${process.env.SUPABASE_URL}`);
});

export default app;
