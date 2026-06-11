-- =============================================================================
-- THRESHOLD — SQL Functions for Supabase RPC calls
-- Run this AFTER 001_initial_schema.sql
-- =============================================================================

-- ── Search function (fuzzy address + landlord matching) ───────────────────────
CREATE OR REPLACE FUNCTION search_properties(
  search_query  TEXT    DEFAULT '',
  filter_city   TEXT    DEFAULT '',
  filter_zip    TEXT    DEFAULT '',
  filter_beds   INTEGER DEFAULT NULL,
  min_rent      INTEGER DEFAULT NULL,
  max_rent      INTEGER DEFAULT NULL,
  sort_by       TEXT    DEFAULT 'risk_asc',
  page_limit    INTEGER DEFAULT 20,
  page_offset   INTEGER DEFAULT 0
)
RETURNS TABLE (
  id UUID, canonical_address TEXT, street TEXT, city TEXT, state TEXT, zip TEXT,
  lat NUMERIC, lng NUMERIC, bedrooms INTEGER, bathrooms NUMERIC, sqft INTEGER,
  property_type TEXT, year_built INTEGER, risk_score NUMERIC, fee_score NUMERIC,
  habitability_score NUMERIC, conduct_score NUMERIC,
  accepts_vouchers BOOLEAN, accepts_pets BOOLEAN, accepts_families BOOLEAN,
  landlord_name TEXT, landlord_type TEXT, landlord_verified BOOLEAN,
  portfolio_risk NUMERIC, evictions_total INTEGER, violations_total INTEGER,
  current_listed_price INTEGER, days_on_market INTEGER, listing_status TEXT,
  photo_urls TEXT[], listing_source TEXT, available_date DATE,
  fmr_1br INTEGER, fmr_2br INTEGER, tract_median_rent INTEGER,
  review_count BIGINT, open_violations BIGINT, eviction_count BIGINT,
  reported_fee_types TEXT[]
)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id, p.canonical_address, p.street, p.city, p.state, p.zip,
    p.lat, p.lng, p.bedrooms, p.bathrooms, p.sqft,
    p.property_type, p.year_built, p.risk_score, p.fee_score,
    p.habitability_score, p.conduct_score,
    p.accepts_vouchers, p.accepts_pets, p.accepts_families,
    l.name, l.entity_type, l.verified,
    l.portfolio_risk, l.evictions_total, l.violations_total,
    rl.listed_price, rl.days_on_market, rl.status,
    rl.photo_urls, rl.source, rl.available_date,
    fmr.fmr_1br, fmr.fmr_2br,
    acs.median_rent,
    COUNT(DISTINCT tr.id),
    COUNT(DISTINCT v.id),
    COUNT(DISTINCT er.id),
    ARRAY_AGG(DISTINCT fr.fee_type) FILTER (WHERE fr.fee_type IS NOT NULL)
  FROM properties p
  LEFT JOIN ownership_records o   ON o.property_id = p.id AND o.is_current
  LEFT JOIN landlords         l   ON l.id = o.landlord_id
  LEFT JOIN rental_listings   rl  ON rl.property_id = p.id AND rl.status = 'active'
  LEFT JOIN hud_fmr           fmr ON fmr.zip = p.zip AND fmr.year = EXTRACT(YEAR FROM NOW())::INT
  LEFT JOIN census_acs        acs ON acs.census_tract = p.census_tract AND acs.vintage = 2022
  LEFT JOIN tenant_reviews    tr  ON tr.property_id = p.id AND tr.status = 'approved'
  LEFT JOIN violations        v   ON v.property_id = p.id AND v.status = 'open'
  LEFT JOIN eviction_records  er  ON er.property_id = p.id
  LEFT JOIN fee_reports       fr  ON fr.property_id = p.id
  WHERE
    (search_query = '' OR
      p.canonical_address ILIKE '%' || search_query || '%' OR
      p.canonical_address % search_query OR
      l.name ILIKE '%' || search_query || '%')
    AND (filter_city = '' OR p.city ILIKE '%' || filter_city || '%')
    AND (filter_zip  = '' OR p.zip = filter_zip)
    AND (filter_beds IS NULL OR p.bedrooms = filter_beds)
    AND (min_rent IS NULL OR rl.listed_price >= min_rent)
    AND (max_rent IS NULL OR rl.listed_price <= max_rent)
  GROUP BY p.id, l.id, rl.id, fmr.id, acs.id
  ORDER BY
    CASE WHEN sort_by = 'risk_asc'   THEN p.risk_score END ASC NULLS LAST,
    CASE WHEN sort_by = 'risk_desc'  THEN p.risk_score END DESC NULLS LAST,
    CASE WHEN sort_by = 'price_asc'  THEN rl.listed_price END ASC NULLS LAST,
    CASE WHEN sort_by = 'price_desc' THEN rl.listed_price END DESC NULLS LAST,
    CASE WHEN sort_by = 'recent'     THEN rl.listed_at END DESC NULLS LAST
  LIMIT page_limit OFFSET page_offset;
END;
$$;


-- ── Fee summary per property ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_fee_summary(prop_id UUID)
RETURNS TABLE (
  fee_type TEXT, report_count BIGINT, avg_amount NUMERIC,
  refundable BOOLEAN, disclosed_upfront BOOLEAN, description TEXT
)
LANGUAGE sql AS $$
  SELECT
    fee_type,
    COUNT(*) AS report_count,
    AVG(amount) AS avg_amount,
    BOOL_OR(refundable) AS refundable,
    BOOL_OR(disclosed_upfront) AS disclosed_upfront,
    MAX(description) AS description
  FROM fee_reports
  WHERE property_id = prop_id
  GROUP BY fee_type
  ORDER BY report_count DESC;
$$;


-- ── Price history per property ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_price_history(prop_id UUID)
RETURNS TABLE (observed_price INTEGER, observed_at TIMESTAMPTZ, source TEXT)
LANGUAGE sql AS $$
  SELECT ph.observed_price, ph.observed_at, ph.source
  FROM listing_price_history ph
  JOIN rental_listings rl ON rl.id = ph.listing_id
  WHERE rl.property_id = prop_id
  ORDER BY ph.observed_at ASC;
$$;


-- ── Top risk properties by geography ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_top_risk_properties(
  geo_type_param TEXT,
  geo_id_param   TEXT,
  result_limit   INTEGER DEFAULT 5
)
RETURNS TABLE (id UUID, street TEXT, city TEXT, risk_score NUMERIC, landlord TEXT)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT p.id, p.street, p.city, p.risk_score, l.name
  FROM properties p
  LEFT JOIN ownership_records o ON o.property_id = p.id AND o.is_current
  LEFT JOIN landlords l ON l.id = o.landlord_id
  WHERE
    CASE geo_type_param
      WHEN 'zip'  THEN p.zip  = geo_id_param
      WHEN 'city' THEN p.city = geo_id_param
      ELSE FALSE
    END
  ORDER BY p.risk_score ASC NULLS LAST
  LIMIT result_limit;
END;
$$;


-- ── Rent trend by geography ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_rent_trend(
  geo_type_param TEXT,
  geo_id_param   TEXT
)
RETURNS TABLE (month TIMESTAMPTZ, avg_rent NUMERIC)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT
    DATE_TRUNC('month', ph.observed_at) AS month,
    AVG(ph.observed_price)              AS avg_rent
  FROM listing_price_history ph
  JOIN rental_listings rl ON rl.id = ph.listing_id
  JOIN properties p       ON p.id  = rl.property_id
  WHERE
    ph.observed_at > NOW() - INTERVAL '24 months'
    AND CASE geo_type_param
      WHEN 'zip'  THEN p.zip  = geo_id_param
      WHEN 'city' THEN p.city = geo_id_param
      ELSE FALSE
    END
  GROUP BY month
  ORDER BY month ASC;
END;
$$;


-- ── Refresh neighborhood stats (called by cron) ───────────────────────────────
CREATE OR REPLACE FUNCTION refresh_neighborhood_stats()
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO neighborhood_stats (
    geo_type, geo_id, geo_name,
    median_listed_rent, avg_rent_1br, avg_rent_2br,
    avg_risk_score, high_risk_count, total_reviews,
    computed_at, vintage
  )
  SELECT
    'zip', p.zip, p.zip,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY rl.listed_price),
    AVG(rl.listed_price) FILTER (WHERE p.bedrooms = 1),
    AVG(rl.listed_price) FILTER (WHERE p.bedrooms = 2),
    AVG(p.risk_score),
    COUNT(*) FILTER (WHERE p.risk_score <= 3.5),
    COUNT(DISTINCT tr.id),
    NOW(), TO_CHAR(NOW(), 'YYYY-"Q"Q')
  FROM properties p
  LEFT JOIN rental_listings rl ON rl.property_id = p.id AND rl.status = 'active'
  LEFT JOIN tenant_reviews tr  ON tr.property_id = p.id AND tr.status = 'approved'
  WHERE p.zip IS NOT NULL
  GROUP BY p.zip
  ON CONFLICT (geo_type, geo_id, vintage) DO UPDATE SET
    median_listed_rent = EXCLUDED.median_listed_rent,
    avg_risk_score     = EXCLUDED.avg_risk_score,
    total_reviews      = EXCLUDED.total_reviews,
    computed_at        = NOW();
END;
$$;


-- ── Refresh landlord aggregates (called by cron) ──────────────────────────────
CREATE OR REPLACE FUNCTION refresh_landlord_aggregates()
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  UPDATE landlords l SET
    properties_count = (
      SELECT COUNT(*) FROM ownership_records o
      WHERE o.landlord_id = l.id AND o.is_current
    ),
    violations_total = (
      SELECT COUNT(*) FROM violations v WHERE v.landlord_id = l.id
    ),
    evictions_total = (
      SELECT COUNT(*) FROM eviction_records e WHERE e.landlord_id = l.id
    ),
    portfolio_risk = (
      SELECT ROUND(AVG(p.risk_score), 2)
      FROM properties p
      JOIN ownership_records o ON o.property_id = p.id AND o.is_current
      WHERE o.landlord_id = l.id
    ),
    updated_at = NOW();
END;
$$;


-- ── Row Level Security (RLS) ──────────────────────────────────────────────────
-- Public can read approved reviews and all property data
-- Only service role can insert/update

ALTER TABLE properties        ENABLE ROW LEVEL SECURITY;
ALTER TABLE landlords         ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_reviews    ENABLE ROW LEVEL SECURITY;
ALTER TABLE violations        ENABLE ROW LEVEL SECURITY;
ALTER TABLE eviction_records  ENABLE ROW LEVEL SECURITY;
ALTER TABLE rental_listings   ENABLE ROW LEVEL SECURITY;
ALTER TABLE property_timeline ENABLE ROW LEVEL SECURITY;
ALTER TABLE fee_reports       ENABLE ROW LEVEL SECURITY;

-- Public read policies
CREATE POLICY "Public read properties"     ON properties        FOR SELECT USING (TRUE);
CREATE POLICY "Public read landlords"      ON landlords         FOR SELECT USING (TRUE);
CREATE POLICY "Public read approved reviews" ON tenant_reviews  FOR SELECT USING (status = 'approved');
CREATE POLICY "Public read violations"     ON violations        FOR SELECT USING (TRUE);
CREATE POLICY "Public read evictions"      ON eviction_records  FOR SELECT USING (TRUE);
CREATE POLICY "Public read listings"       ON rental_listings   FOR SELECT USING (TRUE);
CREATE POLICY "Public read timeline"       ON property_timeline FOR SELECT USING (is_public = TRUE);
CREATE POLICY "Public read fees"           ON fee_reports       FOR SELECT USING (TRUE);

-- Anyone can submit a review (goes to pending moderation)
CREATE POLICY "Public insert reviews"      ON tenant_reviews    FOR INSERT WITH CHECK (status = 'pending');
CREATE POLICY "Public insert fees"         ON fee_reports       FOR INSERT WITH CHECK (TRUE);
