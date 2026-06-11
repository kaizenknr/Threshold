// =============================================================================
// THRESHOLD RISK ENGINE — src/engine/risk.js
// Computes composite risk scores from all available signals
// =============================================================================

import { db } from '../server.js';

// =============================================================================
// SIGNAL WEIGHTS
// Higher weight = more influence on final score
// =============================================================================
const WEIGHTS = {
  // Community signals (highest weight — direct tenant experience)
  fee_transparency_avg:      0.20,
  maintenance_avg:           0.15,
  conduct_avg:               0.12,
  price_accuracy_avg:        0.13,
  habitability_avg:          0.12,

  // Government signals (objective, verifiable)
  open_violations:           0.10,   // per-violation penalty
  eviction_rate:             0.08,   // evictions / years operating
  critical_violations:       0.05,   // critical severity bonus penalty

  // Market signals
  rent_vs_fmr:               0.03,   // how far above HUD FMR
  price_change_frequency:    0.02,   // frequent price changes = instability
};

// Fee type severity multipliers
const FEE_SEVERITY = {
  nonrefundable_deposit:   3.0,
  admin_package:           2.5,
  processing_fee:          2.0,
  application_fee:         1.5,
  amenity_package:         2.0,
  movein_special_expired:  2.5,
  pet_fee_unlisted:        1.2,
  parking_fee_unlisted:    1.2,
};

const VIOLATION_SEVERITY = {
  critical: 4.0,
  major:    2.5,
  moderate: 1.5,
  minor:    0.5,
};

// =============================================================================
// MAIN SCORER
// =============================================================================
export async function computeRisk(propertyId) {
  // Pull all signals
  const [reviews, violations, evictions, fees, prices, prop] = await Promise.all([
    db.query(`
      SELECT score_fee_transparency, score_maintenance, score_conduct,
        score_price_accuracy, score_habitability, advertised_rent, actual_rent
      FROM tenant_reviews
      WHERE property_id = $1 AND status = 'approved'
    `, [propertyId]),

    db.query(`
      SELECT severity, status, violation_type FROM violations WHERE property_id = $1
    `, [propertyId]),

    db.query(`
      SELECT filing_date, outcome FROM eviction_records WHERE property_id = $1
    `, [propertyId]),

    db.query(`
      SELECT fee_type, COUNT(*) AS cnt FROM fee_reports
      WHERE property_id = $1 GROUP BY fee_type
    `, [propertyId]),

    db.query(`
      SELECT observed_price, observed_at FROM listing_price_history ph
      JOIN rental_listings rl ON rl.id = ph.listing_id
      WHERE rl.property_id = $1 ORDER BY observed_at
    `, [propertyId]),

    db.query(`
      SELECT p.*, fmr.fmr_1br, fmr.fmr_2br, rl.listed_price
      FROM properties p
      LEFT JOIN hud_fmr fmr ON fmr.zip = p.zip AND fmr.year = EXTRACT(YEAR FROM NOW())::INT
      LEFT JOIN rental_listings rl ON rl.property_id = p.id AND rl.status = 'active'
      WHERE p.id = $1 LIMIT 1
    `, [propertyId]),
  ]);

  if (!prop.rows[0]) return null;
  const property = prop.rows[0];
  const factors = [];
  const positives = [];

  // ── 1. Community review scores (1-10, invert for risk: 10 = safest = lowest risk) ──
  let communityRisk = 5.0;  // neutral default
  if (reviews.rows.length > 0) {
    const r = reviews.rows;
    const avgFee   = avg(r, 'score_fee_transparency');
    const avgMaint = avg(r, 'score_maintenance');
    const avgCond  = avg(r, 'score_conduct');
    const avgPrice = avg(r, 'score_price_accuracy');
    const avgHabit = avg(r, 'score_habitability');

    // Convert 1-10 review scores to 0-10 risk (invert: high score = low risk)
    communityRisk =
      (10 - avgFee)   * WEIGHTS.fee_transparency_avg   / 0.20 * 10 +
      (10 - avgMaint) * WEIGHTS.maintenance_avg         / 0.15 * 10 +
      (10 - avgCond)  * WEIGHTS.conduct_avg             / 0.12 * 10 +
      (10 - avgPrice) * WEIGHTS.price_accuracy_avg      / 0.13 * 10 +
      (10 - avgHabit) * WEIGHTS.habitability_avg        / 0.12 * 10;
    communityRisk = communityRisk / 5;  // normalize

    if (avgFee < 3) factors.push({ factor: 'Fee transparency', severity: 'critical', value: avgFee.toFixed(1), note: 'Multiple tenants report undisclosed fees at signing' });
    if (avgMaint < 4) factors.push({ factor: 'Maintenance', severity: 'warning', value: avgMaint.toFixed(1), note: 'Slow or unresponsive maintenance reported' });
    if (avgFee > 8) positives.push({ signal: 'Fee transparency', note: 'Tenants consistently report transparent, upfront fees' });
    if (avgMaint > 8) positives.push({ signal: 'Responsive maintenance', note: 'Issues resolved quickly per tenant reports' });
  }

  // ── 2. Ghost rate detection ──
  let ghostRiskAdd = 0;
  const priceDiscrepancies = reviews.rows.filter(r =>
    r.advertised_rent && r.actual_rent &&
    r.actual_rent > r.advertised_rent * 1.05  // more than 5% above advertised
  );
  if (priceDiscrepancies.length > 0) {
    const avgHike = priceDiscrepancies.reduce((a, r) =>
      a + ((r.actual_rent - r.advertised_rent) / r.advertised_rent), 0
    ) / priceDiscrepancies.length * 100;
    ghostRiskAdd = Math.min(avgHike / 5, 2.0);  // up to +2 risk pts
    factors.push({ factor: 'Ghost rate', severity: avgHike > 15 ? 'critical' : 'warning', value: `+${avgHike.toFixed(0)}%`, note: `Avg actual rent ${avgHike.toFixed(0)}% above listing price` });
  }

  // ── 3. Fee reports ──
  let feeRiskAdd = 0;
  for (const fee of fees.rows) {
    const weight = FEE_SEVERITY[fee.fee_type] || 1.0;
    feeRiskAdd += Math.min(parseInt(fee.cnt) * weight * 0.15, 0.8);
    if (fee.cnt >= 2) {
      factors.push({
        factor: `Fee: ${fee.fee_type.replace(/_/g, ' ')}`,
        severity: weight >= 2.5 ? 'critical' : 'warning',
        value: `${fee.cnt} report${fee.cnt > 1 ? 's' : ''}`,
        note: getFeeNote(fee.fee_type),
      });
    }
  }

  // ── 4. Violations ──
  let violationRisk = 0;
  const openViolations = violations.rows.filter(v => v.status === 'open');
  const criticalViolations = violations.rows.filter(v => v.severity === 'critical');

  for (const v of violations.rows) {
    const mult = VIOLATION_SEVERITY[v.severity] || 1.0;
    const statusMult = v.status === 'open' ? 1.5 : 0.5;
    violationRisk += mult * statusMult * WEIGHTS.open_violations;
  }
  violationRisk = Math.min(violationRisk, 3.0);

  if (openViolations.length > 0) factors.push({ factor: 'Open violations', severity: criticalViolations.length ? 'critical' : 'warning', value: openViolations.length, note: `${openViolations.length} unresolved code/habitability violations` });
  if (violations.rows.length === 0) positives.push({ signal: 'No violations', note: 'No building code or habitability violations on record' });

  // ── 5. Evictions ──
  let evictionRisk = 0;
  if (evictions.rows.length > 0) {
    evictionRisk = Math.min(evictions.rows.length * 0.4, 2.0);
    factors.push({ factor: 'Eviction history', severity: evictions.rows.length > 3 ? 'critical' : 'warning', value: evictions.rows.length, note: `${evictions.rows.length} eviction filing${evictions.rows.length !== 1 ? 's' : ''} on record` });
  }

  // ── 6. Rent vs FMR ──
  let fmrRisk = 0;
  const listedPrice = property.listed_price;
  const fmrBench = property.bedrooms <= 1 ? property.fmr_1br : property.fmr_2br;
  if (listedPrice && fmrBench) {
    const pctAbove = ((listedPrice - fmrBench) / fmrBench) * 100;
    if (pctAbove > 50) {
      fmrRisk = 1.0;
      factors.push({ factor: 'Rent vs HUD FMR', severity: 'warning', value: `+${pctAbove.toFixed(0)}%`, note: `Listed rent ${pctAbove.toFixed(0)}% above HUD Fair Market Rent for this area` });
    } else if (pctAbove < 0) {
      positives.push({ signal: 'Below-market rent', note: `Listed rent ${Math.abs(pctAbove).toFixed(0)}% below HUD Fair Market Rent` });
    }
  }

  // ── 7. Price volatility ──
  let priceVolatility = 0;
  if (prices.rows.length > 3) {
    const changes = prices.rows.slice(1).filter((p, i) =>
      p.observed_price !== prices.rows[i].observed_price
    ).length;
    if (changes > 3) {
      priceVolatility = Math.min(changes * 0.1, 0.5);
      factors.push({ factor: 'Price instability', severity: 'info', value: `${changes} changes`, note: 'Frequent price changes may indicate instability or ghost-rate patterns' });
    }
  }

  // ── Combine all signals ──
  const reviewWeight   = reviews.rows.length > 0 ? 0.60 : 0.0;
  const govWeight      = violations.rows.length > 0 || evictions.rows.length > 0 ? 0.25 : 0.10;
  const marketWeight   = 1 - reviewWeight - govWeight;

  let rawScore;
  if (reviews.rows.length === 0 && violations.rows.length === 0) {
    rawScore = 5.0;  // not enough data
  } else {
    rawScore = (
      communityRisk   * reviewWeight +
      (violationRisk + evictionRisk) / 5 * 10 * govWeight +
      (fmrRisk + priceVolatility) / 2 * 10 * marketWeight
    ) + ghostRiskAdd + feeRiskAdd;
  }

  // Clamp to 0-10, invert (10 = most risky)
  const finalRisk = Math.max(0, Math.min(10, rawScore));

  // Sub-scores (also 0-10, same inversion)
  const feeScore   = reviews.rows.length ? Math.max(0, 10 - avg(reviews.rows, 'score_fee_transparency')) : null;
  const habitScore = reviews.rows.length ? Math.max(0, 10 - avg(reviews.rows, 'score_habitability'))    : null;
  const condScore  = reviews.rows.length ? Math.max(0, 10 - avg(reviews.rows, 'score_conduct'))          : null;

  const confidence = computeConfidence(reviews.rows.length, violations.rows.length, evictions.rows.length);

  const summary = generateSummary(finalRisk, factors, positives, reviews.rows.length);

  // Persist
  await db.query(`
    INSERT INTO risk_assessments (
      property_id, risk_score, confidence, fee_score, habitability_score, conduct_score,
      review_count, violation_count, eviction_count, fee_report_count,
      risk_summary, risk_factors, positive_signals, model_version
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'1.0')
  `, [
    propertyId, finalRisk.toFixed(2), confidence.toFixed(2),
    feeScore?.toFixed(2), habitScore?.toFixed(2), condScore?.toFixed(2),
    reviews.rows.length, violations.rows.length, evictions.rows.length, fees.rows.length,
    summary, JSON.stringify(factors), JSON.stringify(positives),
  ]);

  // Update property
  await db.query(`
    UPDATE properties SET
      risk_score = $2, risk_confidence = $3,
      fee_score = $4, habitability_score = $5, conduct_score = $6,
      risk_updated_at = NOW()
    WHERE id = $1
  `, [propertyId, finalRisk.toFixed(2), confidence.toFixed(2),
      feeScore?.toFixed(2), habitScore?.toFixed(2), condScore?.toFixed(2)]);

  return { risk_score: finalRisk, confidence, factors, positives, summary };
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function avg(rows, key) {
  if (!rows.length) return 5;
  return rows.reduce((a, r) => a + (parseFloat(r[key]) || 0), 0) / rows.length;
}

function computeConfidence(reviewCount, violationCount, evictionCount) {
  // More data = higher confidence
  let conf = 0.3;  // base
  conf += Math.min(reviewCount * 0.08, 0.4);
  conf += violationCount > 0 ? 0.15 : 0;
  conf += evictionCount  > 0 ? 0.15 : 0;
  return Math.min(conf, 1.0);
}

function generateSummary(score, factors, positives, reviewCount) {
  if (reviewCount === 0 && factors.length === 0) {
    return 'No tenant reports or government records found yet. Score based on limited data.';
  }
  if (score >= 7) {
    return `Strong signals from ${reviewCount} tenant report${reviewCount !== 1 ? 's' : ''}. ${positives.length > 0 ? positives.map(p => p.signal).join(', ') + ' reported.' : ''}`;
  }
  if (score >= 4) {
    const warns = factors.filter(f => f.severity !== 'critical').map(f => f.factor);
    return `Mixed signals. Concerns: ${warns.slice(0,2).join(', ')}. Review reports carefully before signing.`;
  }
  const crits = factors.filter(f => f.severity === 'critical').map(f => f.factor);
  return `High risk. Critical issues: ${crits.slice(0,3).join(', ')}. ${reviewCount} tenant report${reviewCount !== 1 ? 's' : ''} filed.`;
}

function getFeeNote(feeType) {
  const notes = {
    nonrefundable_deposit:  'Tenants report deposit withheld or declared non-refundable at signing.',
    admin_package:          'Bundled admin charges added at lease signing, not disclosed in listing.',
    processing_fee:         'Processing fee charged on top of application fee with no disclosed purpose.',
    application_fee:        'Application fee reported as undisclosed or higher than stated.',
    amenity_package:        'Mandatory amenity charges added monthly beyond listed rent.',
    movein_special_expired: 'Advertised move-in discount not honored at signing.',
  };
  return notes[feeType] || 'Fee reported by tenants as undisclosed or excessive.';
}
