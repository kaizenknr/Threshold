-- =============================================================================
-- THRESHOLD RENTAL INTELLIGENCE PLATFORM
-- PostgreSQL Schema v1.0
-- =============================================================================

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";       -- fuzzy text search
CREATE EXTENSION IF NOT EXISTS "postgis";        -- geographic queries
CREATE EXTENSION IF NOT EXISTS "btree_gin";      -- compound GIN indexes

-- =============================================================================
-- CORE: PROPERTIES
-- =============================================================================

CREATE TABLE properties (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  -- Canonical address (normalized via Census Geocoder)
  canonical_address TEXT NOT NULL,
  street            TEXT NOT NULL,
  unit              TEXT,
  city              TEXT NOT NULL,
  county            TEXT,
  state             TEXT NOT NULL DEFAULT 'CA',
  zip               TEXT NOT NULL,
  -- Geographic
  lat               NUMERIC(10,7),
  lng               NUMERIC(10,7),
  geom              GEOMETRY(Point, 4326),  -- PostGIS point
  census_tract      TEXT,
  census_block      TEXT,
  county_fips       TEXT,
  -- Property details
  property_type     TEXT,   -- apartment | condo | house | multi-family | room | studio
  year_built        INTEGER,
  sqft              INTEGER,
  bedrooms          INTEGER,
  bathrooms         NUMERIC(3,1),
  lot_size_sqft     INTEGER,
  stories           INTEGER,
  units_in_building INTEGER,
  -- APN / parcel
  apn               TEXT,   -- Assessor Parcel Number
  -- Renter policy (community-reported)
  accepts_vouchers  BOOLEAN,
  accepts_pets      BOOLEAN,
  accepts_students  BOOLEAN,
  accepts_families  BOOLEAN,
  min_income_mult   NUMERIC(3,1),  -- e.g. 3.0 = 3x rent required
  -- Risk composite (recomputed by AI engine)
  risk_score        NUMERIC(4,2),
  risk_confidence   NUMERIC(4,2),
  fee_score         NUMERIC(4,2),
  habitability_score NUMERIC(4,2),
  conduct_score     NUMERIC(4,2),
  sentiment_score   NUMERIC(4,2),
  risk_updated_at   TIMESTAMPTZ,
  -- Meta
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(canonical_address)
);

CREATE INDEX idx_properties_zip        ON properties(zip);
CREATE INDEX idx_properties_city       ON properties(city);
CREATE INDEX idx_properties_county     ON properties(county);
CREATE INDEX idx_properties_apn        ON properties(apn);
CREATE INDEX idx_properties_risk       ON properties(risk_score);
CREATE INDEX idx_properties_geom       ON properties USING GIST(geom);
CREATE INDEX idx_properties_address_trgm ON properties USING GIN(canonical_address gin_trgm_ops);


-- =============================================================================
-- CORE: LANDLORDS & OWNERSHIP
-- =============================================================================

CREATE TABLE landlords (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  -- Identity
  name              TEXT NOT NULL,
  name_normalized   TEXT,           -- lowercase, stripped for matching
  entity_type       TEXT,           -- individual | llc | corp | trust | mgmt_co | reit
  -- Registration
  state_reg_number  TEXT,           -- CA SOS filing number
  state_reg_state   TEXT DEFAULT 'CA',
  ein               TEXT,           -- Federal EIN if available
  -- Contact / mailing (from assessor records)
  mailing_address   TEXT,
  mailing_city      TEXT,
  mailing_state     TEXT,
  mailing_zip       TEXT,
  -- Verification
  verified          BOOLEAN DEFAULT FALSE,
  verified_source   TEXT,           -- sos | attom | manual
  verified_at       TIMESTAMPTZ,
  -- Computed aggregates (refreshed nightly)
  properties_count  INTEGER DEFAULT 0,
  active_listings   INTEGER DEFAULT 0,
  total_units       INTEGER DEFAULT 0,
  portfolio_risk    NUMERIC(4,2),
  flags_total       INTEGER DEFAULT 0,
  evictions_total   INTEGER DEFAULT 0,
  violations_total  INTEGER DEFAULT 0,
  lawsuits_total    INTEGER DEFAULT 0,
  -- Meta
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_landlords_name_trgm ON landlords USING GIN(name gin_trgm_ops);
CREATE INDEX idx_landlords_reg       ON landlords(state_reg_number);
CREATE INDEX idx_landlords_risk      ON landlords(portfolio_risk);

-- Ownership records (a property changes hands; track full history)
CREATE TABLE ownership_records (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  property_id     UUID REFERENCES properties(id) ON DELETE CASCADE,
  landlord_id     UUID REFERENCES landlords(id),
  role            TEXT DEFAULT 'owner',  -- owner | manager | agent | listed_owner
  -- Dates
  effective_date  DATE,
  end_date        DATE,
  is_current      BOOLEAN DEFAULT TRUE,
  -- Purchase details
  purchase_price  INTEGER,          -- USD
  purchase_date   DATE,
  deed_type       TEXT,             -- grant | quitclaim | trust_transfer
  document_number TEXT,             -- county recorder doc number
  -- Source
  source          TEXT,             -- attom | county_assessor | manual
  source_id       TEXT,
  fetched_at      TIMESTAMPTZ,
  -- Meta
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ownership_property  ON ownership_records(property_id);
CREATE INDEX idx_ownership_landlord  ON ownership_records(landlord_id);
CREATE INDEX idx_ownership_current   ON ownership_records(is_current) WHERE is_current = TRUE;


-- =============================================================================
-- LISTINGS: RENTAL MARKET DATA
-- =============================================================================

CREATE TABLE rental_listings (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  property_id     UUID REFERENCES properties(id),
  -- Source
  source          TEXT NOT NULL,    -- zillow | rentcast | realtor | apartments | zumper | rent
  source_id       TEXT,             -- external listing ID
  listing_url     TEXT,
  -- Pricing
  listed_price    INTEGER,          -- monthly rent USD
  price_min       INTEGER,          -- if range listed
  price_max       INTEGER,
  deposit         INTEGER,
  -- Details
  bedrooms        INTEGER,
  bathrooms       NUMERIC(3,1),
  sqft            INTEGER,
  available_date  DATE,
  lease_term      TEXT,             -- month-to-month | 12-month | flexible
  furnished       BOOLEAN DEFAULT FALSE,
  utilities_included TEXT[],        -- water | gas | electric | internet | trash
  amenities       TEXT[],
  pet_policy      TEXT,
  parking         TEXT,
  -- Listing lifecycle
  listed_at       TIMESTAMPTZ,
  last_seen_at    TIMESTAMPTZ,
  delisted_at     TIMESTAMPTZ,
  days_on_market  INTEGER,
  -- Photos
  photo_urls      TEXT[],
  -- Status
  status          TEXT DEFAULT 'active',  -- active | pending | delisted
  -- Meta
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(source, source_id)
);

CREATE INDEX idx_listings_property   ON rental_listings(property_id);
CREATE INDEX idx_listings_source     ON rental_listings(source);
CREATE INDEX idx_listings_price      ON rental_listings(listed_price);
CREATE INDEX idx_listings_status     ON rental_listings(status);
CREATE INDEX idx_listings_zip        ON rental_listings(property_id);  -- via join

-- Price history (track every observed price change)
CREATE TABLE listing_price_history (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  listing_id    UUID REFERENCES rental_listings(id) ON DELETE CASCADE,
  property_id   UUID REFERENCES properties(id),
  observed_price INTEGER NOT NULL,
  observed_at    TIMESTAMPTZ DEFAULT NOW(),
  source         TEXT
);

CREATE INDEX idx_price_history_listing  ON listing_price_history(listing_id);
CREATE INDEX idx_price_history_property ON listing_price_history(property_id);
CREATE INDEX idx_price_history_date     ON listing_price_history(observed_at);


-- =============================================================================
-- GOVERNMENT: HUD / CENSUS / ASSESSOR DATA
-- =============================================================================

CREATE TABLE hud_fmr (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  zip           TEXT NOT NULL,
  county_fips   TEXT,
  metro_name    TEXT,
  year          INTEGER NOT NULL,
  fmr_0br       INTEGER,
  fmr_1br       INTEGER,
  fmr_2br       INTEGER,
  fmr_3br       INTEGER,
  fmr_4br       INTEGER,
  fetched_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(zip, year)
);

CREATE TABLE census_acs (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  census_tract        TEXT NOT NULL,
  county_fips         TEXT,
  state_fips          TEXT DEFAULT '06',
  vintage             INTEGER NOT NULL,   -- ACS year
  -- B25064: Median gross rent
  median_rent         INTEGER,
  -- B25070: Gross rent as pct of household income
  rent_burden_30_pct  NUMERIC(5,2),   -- % households paying 30%+
  rent_burden_50_pct  NUMERIC(5,2),   -- % households paying 50%+
  -- B25003: Tenure
  total_households    INTEGER,
  owner_occupied      INTEGER,
  renter_occupied     INTEGER,
  -- B25002: Occupancy
  total_units         INTEGER,
  occupied_units      INTEGER,
  vacant_units        INTEGER,
  fetched_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(census_tract, vintage)
);

CREATE TABLE property_tax_records (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  property_id     UUID REFERENCES properties(id),
  apn             TEXT,
  tax_year        INTEGER,
  assessed_value  INTEGER,
  land_value      INTEGER,
  improvement_value INTEGER,
  tax_amount      INTEGER,
  exemptions      TEXT[],
  source          TEXT,
  fetched_at      TIMESTAMPTZ DEFAULT NOW()
);


-- =============================================================================
-- VIOLATIONS & LEGAL
-- =============================================================================

CREATE TABLE violations (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  property_id     UUID REFERENCES properties(id),
  landlord_id     UUID REFERENCES landlords(id),
  -- Violation details
  violation_type  TEXT NOT NULL,   -- habitability | building_code | fire | health | zoning
  category        TEXT,            -- mold | pest | electrical | plumbing | structural | hvac
  description     TEXT,
  severity        TEXT,            -- minor | moderate | major | critical
  -- Source agency
  source_agency   TEXT,            -- lahd | ladbs | lafd | lacounty_dph | hcd | dca
  case_number     TEXT,
  -- Timeline
  inspection_date DATE,
  issued_date     DATE,
  due_date        DATE,
  resolved_date   DATE,
  status          TEXT DEFAULT 'open',  -- open | resolved | appealed | dismissed
  -- Penalty
  fine_amount     INTEGER,
  fine_paid       BOOLEAN,
  -- Meta
  source          TEXT,
  source_id       TEXT,
  fetched_at      TIMESTAMPTZ DEFAULT NOW(),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_violations_property ON violations(property_id);
CREATE INDEX idx_violations_landlord ON violations(landlord_id);
CREATE INDEX idx_violations_type     ON violations(violation_type);
CREATE INDEX idx_violations_status   ON violations(status);
CREATE INDEX idx_violations_date     ON violations(issued_date);

CREATE TABLE eviction_records (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  property_id     UUID REFERENCES properties(id),
  landlord_id     UUID REFERENCES landlords(id),
  -- Case details
  case_number     TEXT,
  court           TEXT,
  court_state     TEXT DEFAULT 'CA',
  filing_date     DATE,
  hearing_date    DATE,
  resolution_date DATE,
  -- Outcome
  outcome         TEXT,   -- dismissed | default_judgment | settled | judgment_for_landlord | judgment_for_tenant
  eviction_reason TEXT,   -- nonpayment | lease_violation | owner_move_in | ellis_act | nuisance
  -- Amounts
  amount_claimed  INTEGER,
  judgment_amount INTEGER,
  -- Meta
  source          TEXT,
  source_id       TEXT,
  fetched_at      TIMESTAMPTZ DEFAULT NOW(),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_evictions_property ON eviction_records(property_id);
CREATE INDEX idx_evictions_landlord ON eviction_records(landlord_id);
CREATE INDEX idx_evictions_date     ON eviction_records(filing_date);

CREATE TABLE legal_actions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  landlord_id     UUID REFERENCES landlords(id),
  property_id     UUID REFERENCES properties(id),
  action_type     TEXT,   -- lawsuit | settlement | enforcement | injunction | fine
  description     TEXT,
  court           TEXT,
  case_number     TEXT,
  filed_date      DATE,
  resolved_date   DATE,
  outcome         TEXT,
  settlement_amount INTEGER,
  source          TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE permit_history (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  property_id     UUID REFERENCES properties(id),
  permit_number   TEXT,
  permit_type     TEXT,   -- building | electrical | plumbing | mechanical | demolition
  description     TEXT,
  status          TEXT,   -- issued | finaled | expired | voided
  issued_date     DATE,
  finaled_date    DATE,
  estimated_value INTEGER,
  contractor      TEXT,
  source          TEXT,
  source_id       TEXT,
  fetched_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_permits_property ON permit_history(property_id);


-- =============================================================================
-- COMMUNITY: TENANT REVIEWS & REPORTS
-- =============================================================================

CREATE TABLE tenant_reviews (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  property_id         UUID REFERENCES properties(id),
  landlord_id         UUID REFERENCES landlords(id),
  -- Anonymous identity (hashed, never stored raw)
  submitter_hash      TEXT,         -- SHA256 of IP+UA+salt, for dedup only
  -- Tenancy details
  tenancy_start       DATE,
  tenancy_end         DATE,
  unit_number         TEXT,
  is_current_tenant   BOOLEAN DEFAULT FALSE,
  -- Verification
  verified_tenant     BOOLEAN DEFAULT FALSE,
  verification_method TEXT,         -- lease_photo | utility_bill | none
  -- Scores (1-10)
  score_overall       NUMERIC(3,1),
  score_fee_transparency NUMERIC(3,1),
  score_maintenance   NUMERIC(3,1),
  score_conduct       NUMERIC(3,1),
  score_price_accuracy NUMERIC(3,1),
  score_habitability  NUMERIC(3,1),
  -- Narrative
  headline            TEXT,
  body                TEXT,
  -- Pricing data
  advertised_rent     INTEGER,
  actual_rent         INTEGER,
  renewal_hike_pct    NUMERIC(5,2),
  -- Moderation
  status              TEXT DEFAULT 'pending',  -- pending | approved | rejected | flagged
  moderation_notes    TEXT,
  moderated_at        TIMESTAMPTZ,
  -- Evidence
  has_photos          BOOLEAN DEFAULT FALSE,
  has_documents       BOOLEAN DEFAULT FALSE,
  -- Engagement
  helpful_count       INTEGER DEFAULT 0,
  -- Meta
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_reviews_property  ON tenant_reviews(property_id);
CREATE INDEX idx_reviews_landlord  ON tenant_reviews(landlord_id);
CREATE INDEX idx_reviews_status    ON tenant_reviews(status);
CREATE INDEX idx_reviews_score     ON tenant_reviews(score_overall);

-- Fee reports (structured, separate from narrative reviews)
CREATE TABLE fee_reports (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  property_id     UUID REFERENCES properties(id),
  landlord_id     UUID REFERENCES landlords(id),
  review_id       UUID REFERENCES tenant_reviews(id),
  fee_type        TEXT NOT NULL,  -- application | processing | admin_package | amenity | deposit | pet | parking | holding
  amount          INTEGER,        -- USD
  refundable      BOOLEAN,
  disclosed_upfront BOOLEAN,
  description     TEXT,
  status          TEXT DEFAULT 'pending',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_fees_property ON fee_reports(property_id);
CREATE INDEX idx_fees_type     ON fee_reports(fee_type);

-- Maintenance events
CREATE TABLE maintenance_events (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  property_id     UUID REFERENCES properties(id),
  review_id       UUID REFERENCES tenant_reviews(id),
  issue_type      TEXT,   -- mold | plumbing | electrical | pest | hvac | structural | appliance | other
  severity        TEXT,   -- minor | moderate | major
  reported_date   DATE,
  resolved_date   DATE,
  days_to_resolve INTEGER,
  resolved        BOOLEAN DEFAULT FALSE,
  follow_up_count INTEGER DEFAULT 0,
  description     TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_maintenance_property ON maintenance_events(property_id);

-- Review media (photos/documents attached to reviews)
CREATE TABLE review_media (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  review_id   UUID REFERENCES tenant_reviews(id) ON DELETE CASCADE,
  media_type  TEXT,   -- photo | document | lease_redacted
  storage_key TEXT,   -- S3 / R2 object key
  mime_type   TEXT,
  size_bytes  INTEGER,
  moderated   BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);


-- =============================================================================
-- TIMELINE EVENTS (unified property history)
-- =============================================================================

CREATE TABLE property_timeline (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  property_id     UUID REFERENCES properties(id) ON DELETE CASCADE,
  landlord_id     UUID REFERENCES landlords(id),
  -- Event classification
  event_type      TEXT NOT NULL,
  -- Types:
  --   listing_appeared | listing_price_change | listing_removed
  --   ownership_transfer | management_change
  --   violation_issued | violation_resolved | violation_escalated
  --   eviction_filed | eviction_outcome
  --   permit_issued | permit_finaled
  --   review_added | flag_raised
  --   rent_hike_reported | fee_reported
  --   legal_action | settlement
  --   census_snapshot | hud_benchmark_update
  event_category  TEXT,   -- listing | ownership | legal | violation | community | government
  severity        TEXT,   -- info | warning | critical | positive
  -- Event content
  title           TEXT NOT NULL,
  description     TEXT,
  amount          INTEGER,    -- for price changes, fines, etc.
  amount_previous INTEGER,    -- for price change events
  pct_change      NUMERIC(6,2),
  -- Source record links
  source_type     TEXT,       -- table name
  source_id       UUID,       -- FK to the originating row
  -- Dates
  event_date      DATE NOT NULL,
  event_date_end  DATE,       -- for range events (violation open -> resolved)
  -- Display
  is_public       BOOLEAN DEFAULT TRUE,
  icon            TEXT,       -- for UI rendering
  -- Meta
  source          TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_timeline_property  ON property_timeline(property_id);
CREATE INDEX idx_timeline_date      ON property_timeline(event_date DESC);
CREATE INDEX idx_timeline_type      ON property_timeline(event_type);
CREATE INDEX idx_timeline_category  ON property_timeline(event_category);
CREATE INDEX idx_timeline_severity  ON property_timeline(severity);


-- =============================================================================
-- API CACHE
-- =============================================================================

CREATE TABLE api_cache (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cache_key     TEXT UNIQUE NOT NULL,  -- e.g. "hud_fmr:90010:2024"
  api_name      TEXT NOT NULL,
  endpoint      TEXT,
  payload       JSONB,
  status_code   INTEGER,
  fetched_at    TIMESTAMPTZ DEFAULT NOW(),
  expires_at    TIMESTAMPTZ,
  property_id   UUID REFERENCES properties(id)
);

CREATE INDEX idx_cache_key     ON api_cache(cache_key);
CREATE INDEX idx_cache_expires ON api_cache(expires_at);
CREATE INDEX idx_cache_api     ON api_cache(api_name);

-- API call log (rate limit tracking)
CREATE TABLE api_call_log (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  api_name    TEXT NOT NULL,
  endpoint    TEXT,
  status      TEXT,   -- success | error | rate_limited | cached
  response_ms INTEGER,
  property_id UUID,
  called_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_api_log_name  ON api_call_log(api_name);
CREATE INDEX idx_api_log_date  ON api_call_log(called_at);


-- =============================================================================
-- AI RISK ENGINE OUTPUT
-- =============================================================================

CREATE TABLE risk_assessments (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  property_id         UUID REFERENCES properties(id),
  landlord_id         UUID REFERENCES landlords(id),
  -- Scores
  risk_score          NUMERIC(4,2),
  confidence          NUMERIC(4,2),
  fee_score           NUMERIC(4,2),
  habitability_score  NUMERIC(4,2),
  conduct_score       NUMERIC(4,2),
  price_accuracy_score NUMERIC(4,2),
  sentiment_score     NUMERIC(4,2),
  -- Signals used
  review_count        INTEGER,
  violation_count     INTEGER,
  eviction_count      INTEGER,
  fee_report_count    INTEGER,
  -- Explanation
  risk_summary        TEXT,
  risk_factors        JSONB,   -- array of {factor, weight, value, contribution}
  positive_signals    JSONB,
  -- Model meta
  model_version       TEXT,
  computed_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_risk_property ON risk_assessments(property_id);
CREATE INDEX idx_risk_landlord ON risk_assessments(landlord_id);
CREATE INDEX idx_risk_score    ON risk_assessments(risk_score);


-- =============================================================================
-- NEIGHBORHOOD ANALYTICS
-- =============================================================================

CREATE TABLE neighborhood_stats (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  -- Geography (any level)
  geo_type              TEXT,   -- zip | tract | city | county | neighborhood
  geo_id                TEXT,   -- zip code, FIPS, city name
  geo_name              TEXT,
  -- Rent stats
  median_listed_rent    INTEGER,
  median_actual_rent    INTEGER,
  avg_rent_1br          INTEGER,
  avg_rent_2br          INTEGER,
  rent_vs_fmr_pct       NUMERIC(6,2),
  rent_yoy_change_pct   NUMERIC(6,2),
  -- Risk stats
  avg_risk_score        NUMERIC(4,2),
  high_risk_count       INTEGER,
  pct_high_risk         NUMERIC(5,2),
  -- Violation stats
  violations_per_100    NUMERIC(6,2),
  evictions_per_100     NUMERIC(6,2),
  -- Review stats
  total_reviews         INTEGER,
  avg_review_score      NUMERIC(4,2),
  -- Computed at
  computed_at           TIMESTAMPTZ DEFAULT NOW(),
  vintage               TEXT,   -- e.g. "2024-Q2"
  UNIQUE(geo_type, geo_id, vintage)
);

CREATE INDEX idx_neighborhood_geo ON neighborhood_stats(geo_type, geo_id);


-- =============================================================================
-- TRIGGERS: auto-update updated_at
-- =============================================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_properties_updated
  BEFORE UPDATE ON properties
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_landlords_updated
  BEFORE UPDATE ON landlords
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_listings_updated
  BEFORE UPDATE ON rental_listings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_reviews_updated
  BEFORE UPDATE ON tenant_reviews
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- =============================================================================
-- TRIGGER: auto-insert timeline events
-- =============================================================================

-- Violation issued -> timeline
CREATE OR REPLACE FUNCTION violations_to_timeline()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO property_timeline (
    property_id, landlord_id, event_type, event_category, severity,
    title, description, source_type, source_id, event_date, source
  ) VALUES (
    NEW.property_id, NEW.landlord_id,
    CASE WHEN TG_OP = 'INSERT' THEN 'violation_issued' ELSE 'violation_resolved' END,
    'violation',
    CASE NEW.severity WHEN 'critical' THEN 'critical' WHEN 'major' THEN 'warning' ELSE 'info' END,
    NEW.violation_type || ': ' || COALESCE(NEW.category, 'General'),
    NEW.description,
    'violations', NEW.id,
    COALESCE(NEW.issued_date, CURRENT_DATE),
    NEW.source
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_violation_timeline
  AFTER INSERT ON violations
  FOR EACH ROW EXECUTE FUNCTION violations_to_timeline();

-- Eviction filed -> timeline
CREATE OR REPLACE FUNCTION evictions_to_timeline()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO property_timeline (
    property_id, landlord_id, event_type, event_category, severity,
    title, description, source_type, source_id, event_date, source
  ) VALUES (
    NEW.property_id, NEW.landlord_id,
    'eviction_filed', 'legal', 'warning',
    'Eviction filing: ' || COALESCE(NEW.eviction_reason, 'Reason not disclosed'),
    'Filed ' || COALESCE(NEW.filing_date::TEXT, 'date unknown') || ' -- ' || COALESCE(NEW.court, 'court unknown'),
    'eviction_records', NEW.id,
    COALESCE(NEW.filing_date, CURRENT_DATE),
    NEW.source
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_eviction_timeline
  AFTER INSERT ON eviction_records
  FOR EACH ROW EXECUTE FUNCTION evictions_to_timeline();

-- Price change -> timeline
CREATE OR REPLACE FUNCTION price_change_to_timeline()
RETURNS TRIGGER AS $$
DECLARE prev_price INTEGER;
BEGIN
  SELECT observed_price INTO prev_price
  FROM listing_price_history
  WHERE listing_id = NEW.listing_id
  ORDER BY observed_at DESC LIMIT 1;

  IF prev_price IS NOT NULL AND prev_price != NEW.observed_price THEN
    INSERT INTO property_timeline (
      property_id, event_type, event_category, severity,
      title, amount, amount_previous, pct_change,
      source_type, source_id, event_date
    ) VALUES (
      NEW.property_id, 'listing_price_change', 'listing',
      CASE WHEN NEW.observed_price > prev_price THEN 'warning' ELSE 'positive' END,
      CASE WHEN NEW.observed_price > prev_price THEN 'Rent increased' ELSE 'Rent decreased' END,
      NEW.observed_price, prev_price,
      ROUND(((NEW.observed_price - prev_price)::NUMERIC / prev_price) * 100, 2),
      'listing_price_history', NEW.id, CURRENT_DATE
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_price_timeline
  AFTER INSERT ON listing_price_history
  FOR EACH ROW EXECUTE FUNCTION price_change_to_timeline();


-- =============================================================================
-- VIEWS
-- =============================================================================

-- Full property card (used by API)
CREATE OR REPLACE VIEW v_property_card AS
SELECT
  p.*,
  l.name                    AS landlord_name,
  l.entity_type             AS landlord_type,
  l.verified                AS landlord_verified,
  l.portfolio_risk          AS landlord_portfolio_risk,
  l.evictions_total         AS landlord_evictions,
  l.violations_total        AS landlord_violations,
  l.flags_total             AS landlord_flags,
  rl.listed_price           AS current_listed_price,
  rl.status                 AS listing_status,
  rl.days_on_market,
  rl.photo_urls,
  rl.source                 AS listing_source,
  rl.updated_at             AS listing_updated_at,
  fmr.fmr_1br, fmr.fmr_2br, fmr.fmr_3br,
  acs.median_rent           AS tract_median_rent,
  acs.rent_burden_30_pct,
  COUNT(DISTINCT tr.id)     AS review_count,
  COUNT(DISTINCT v.id)      AS violation_count,
  COUNT(DISTINCT er.id)     AS eviction_count
FROM properties p
LEFT JOIN ownership_records  o   ON o.property_id = p.id AND o.is_current = TRUE
LEFT JOIN landlords          l   ON l.id = o.landlord_id
LEFT JOIN rental_listings    rl  ON rl.property_id = p.id AND rl.status = 'active'
LEFT JOIN hud_fmr            fmr ON fmr.zip = p.zip AND fmr.year = EXTRACT(YEAR FROM NOW())::INTEGER
LEFT JOIN census_acs         acs ON acs.census_tract = p.census_tract AND acs.vintage = 2022
LEFT JOIN tenant_reviews     tr  ON tr.property_id = p.id AND tr.status = 'approved'
LEFT JOIN violations         v   ON v.property_id = p.id AND v.status = 'open'
LEFT JOIN eviction_records   er  ON er.property_id = p.id
GROUP BY p.id, l.id, rl.id, fmr.id, acs.id;

-- Landlord portfolio summary
CREATE OR REPLACE VIEW v_landlord_portfolio AS
SELECT
  l.*,
  ARRAY_AGG(DISTINCT p.city)          AS cities,
  ARRAY_AGG(DISTINCT p.zip)           AS zips,
  AVG(p.risk_score)                   AS computed_risk,
  SUM(p.units_in_building)            AS total_units,
  COUNT(DISTINCT v.id)                AS open_violations,
  COUNT(DISTINCT er.id)               AS total_evictions,
  COUNT(DISTINCT tr.id)               AS total_reviews
FROM landlords l
LEFT JOIN ownership_records o  ON o.landlord_id = l.id AND o.is_current = TRUE
LEFT JOIN properties p         ON p.id = o.property_id
LEFT JOIN violations v         ON v.landlord_id = l.id AND v.status = 'open'
LEFT JOIN eviction_records er  ON er.landlord_id = l.id
LEFT JOIN tenant_reviews tr    ON tr.landlord_id = l.id AND tr.status = 'approved'
GROUP BY l.id;
