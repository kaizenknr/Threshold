import { useState, useEffect, useCallback, useRef } from "react";

// ============================================================================
// DESIGN TOKENS
// ============================================================================
const C = {
  bg:"#08070a", bg2:"#111018", bg3:"#1a1922", bg4:"#211f2a",
  w:"#f5f3f0", ivory:"#ede9e3", plat:"#a8a29e",
  platDim:"rgba(168,162,158,0.4)", platFaint:"rgba(168,162,158,0.12)",
  champ:"#e8d5c4", gold:"#c4a882", goldFaint:"rgba(196,168,130,0.12)",
  amber:"#d4a847", amberFaint:"rgba(212,168,71,0.1)",
  red:"#c9404a", redFaint:"rgba(201,64,74,0.1)",
  ice:"#dce6f0", iceFaint:"rgba(220,230,240,0.07)",
};

const TIMELINE_ICONS = {
  listing_appeared:        { icon:"L", color:C.ice,   label:"Listed" },
  listing_price_change:    { icon:"$", color:C.amber, label:"Price change" },
  listing_removed:         { icon:"X", color:C.plat,  label:"Delisted" },
  ownership_transfer:      { icon:"O", color:C.champ, label:"Ownership change" },
  violation_issued:        { icon:"V", color:C.red,   label:"Violation" },
  violation_resolved:      { icon:"V", color:C.ice,   label:"Violation resolved" },
  eviction_filed:          { icon:"E", color:C.red,   label:"Eviction filed" },
  eviction_outcome:        { icon:"E", color:C.amber, label:"Eviction outcome" },
  permit_issued:           { icon:"P", color:C.plat,  label:"Permit" },
  review_added:            { icon:"R", color:C.champ, label:"Tenant review" },
  fee_reported:            { icon:"F", color:C.amber, label:"Fee reported" },
  rent_hike_reported:      { icon:"H", color:C.red,   label:"Rent hike" },
  legal_action:            { icon:"J", color:C.red,   label:"Legal action" },
  census_snapshot:         { icon:"C", color:C.plat,  label:"Census data" },
};

const RENTER_TYPES = {
  whole_unit:       { label:"Whole unit",            warn:false },
  private_room:     { label:"Private room + shared", warn:false },
  family_kids:      { label:"Family-friendly",       warn:false },
  pets_ok:          { label:"Pets OK",               warn:false },
  students_ok:      { label:"Students welcome",      warn:false },
  vouchers_ok:      { label:"Vouchers accepted",     warn:false },
  couples_ok:       { label:"Couples welcome",       warn:false },
  solo_ok:          { label:"Solo renter",           warn:false },
  no_vouchers:      { label:"No vouchers",           warn:true  },
  strict_income:    { label:"Strict income req.",    warn:true  },
};

const FEE_LABELS = {
  application_fee:        "Application fee",
  nonrefundable_deposit:  "Non-refundable deposit",
  processing_fee:         "Processing fee",
  admin_package:          "Admin package",
  amenity_package:        "Amenity package",
  movein_special_expired: "Move-in special expired",
};

// ============================================================================
// BASE COMPONENTS
// ============================================================================
function M({ children, s }) {
  return <span style={{ fontFamily:"'DM Mono',monospace", ...s }}>{children}</span>;
}

function riskColor(score) {
  if (score == null) return C.plat;
  if (score <= 3.5)  return C.red;
  if (score <= 6.0)  return C.amber;
  return C.ice;
}

function riskLabel(score) {
  if (score == null) return "No data";
  if (score <= 3.5)  return "High risk";
  if (score <= 6.0)  return "Moderate";
  return "Low risk";
}

function RiskBadge({ score, size }) {
  const sz = size || 56;
  const col = riskColor(score);
  return (
    <div style={{ width:sz, height:sz, borderRadius:sz*0.16, background:col+"18", border:"1px solid "+col+"44", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
      <M s={{ fontSize:sz*0.32, color:col, lineHeight:1 }}>{score != null ? score.toFixed(1) : "--"}</M>
      <M s={{ fontSize:sz*0.12, color:col, textTransform:"uppercase", letterSpacing:"0.1em", marginTop:2 }}>risk</M>
    </div>
  );
}

function ScoreBar({ val }) {
  if (val == null) return null;
  const col = val <= 3.5 ? C.red : val <= 6 ? C.amber : C.ice;
  return (
    <div style={{ height:2, background:"rgba(168,162,158,0.12)", borderRadius:1 }}>
      <div style={{ height:"100%", width:(val/10*100)+"%", background:col, borderRadius:1 }} />
    </div>
  );
}

function Tag({ children, color, faint, border }) {
  const col = color || C.plat;
  return (
    <span style={{ fontFamily:"'DM Mono',monospace", fontSize:9, letterSpacing:"0.1em", textTransform:"uppercase", color:col, background:faint || col+"10", border:"1px solid "+(border || col+"30"), padding:"4px 9px", borderRadius:4, whiteSpace:"nowrap" }}>
      {children}
    </span>
  );
}

function SectionLabel({ children }) {
  return <M s={{ fontSize:9, letterSpacing:"0.2em", textTransform:"uppercase", color:C.plat, display:"block", marginBottom:12 }}>{children}</M>;
}

function Divider() {
  return <div style={{ height:1, background:"rgba(168,162,158,0.07)", margin:"20px 0" }} />;
}

// ============================================================================
// TIMELINE COMPONENT (Zillow/Yelp-style)
// ============================================================================
function Timeline({ events, compact }) {
  if (!events || !events.length) {
    return (
      <div style={{ padding:"24px 0", textAlign:"center" }}>
        <M s={{ fontSize:11, color:C.platDim }}>No timeline events yet</M>
      </div>
    );
  }

  const grouped = {};
  events.forEach(e => {
    const year = new Date(e.event_date).getFullYear();
    if (!grouped[year]) grouped[year] = [];
    grouped[year].push(e);
  });

  return (
    <div style={{ position:"relative" }}>
      {Object.entries(grouped).sort(([a],[b]) => b-a).map(([year, evts]) => (
        <div key={year}>
          <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:12, marginTop:8 }}>
            <div style={{ height:1, flex:1, background:"rgba(168,162,158,0.1)" }} />
            <M s={{ fontSize:10, color:C.platDim, letterSpacing:"0.12em" }}>{year}</M>
            <div style={{ height:1, flex:1, background:"rgba(168,162,158,0.1)" }} />
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap: compact ? 6 : 10 }}>
            {evts.map(e => {
              const def = TIMELINE_ICONS[e.event_type] || { icon:"*", color:C.plat, label:e.event_type };
              const isNeg = e.severity === "critical" || e.severity === "warning";
              const isPos = e.severity === "positive";
              const borderCol = isNeg ? def.color+"30" : isPos ? C.ice+"20" : "rgba(168,162,158,0.08)";

              return (
                <div key={e.id} style={{ display:"flex", gap:10, padding: compact ? "10px 12px" : "14px 16px", background:C.bg2, border:"1px solid "+borderCol, borderRadius:10, position:"relative" }}>
                  {/* Timeline dot + line */}
                  <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:0, flexShrink:0 }}>
                    <div style={{ width:28, height:28, borderRadius:6, background:def.color+"18", border:"1px solid "+def.color+"40", display:"flex", alignItems:"center", justifyContent:"center" }}>
                      <M s={{ fontSize:10, color:def.color, fontWeight:600 }}>{def.icon}</M>
                    </div>
                  </div>

                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom: compact ? 2 : 4 }}>
                      <div>
                        <M s={{ fontSize:8, letterSpacing:"0.14em", textTransform:"uppercase", color:def.color, display:"block", marginBottom:2 }}>{def.label}</M>
                        <div style={{ fontSize: compact ? 13 : 14, fontWeight:500, color:C.w, lineHeight:1.3 }}>{e.title}</div>
                      </div>
                      <M s={{ fontSize:10, color:C.platDim, flexShrink:0, marginLeft:8 }}>
                        {new Date(e.event_date).toLocaleDateString('en-US', { month:'short', day:'numeric' })}
                      </M>
                    </div>

                    {e.description && !compact && (
                      <div style={{ fontSize:12, color:C.plat, lineHeight:1.55, marginTop:4 }}>{e.description}</div>
                    )}

                    {(e.amount || e.pct_change) && (
                      <div style={{ display:"flex", gap:8, marginTop:6 }}>
                        {e.amount && <Tag color={e.amount > (e.amount_previous||0) ? C.red : C.ice}>${e.amount.toLocaleString()}</Tag>}
                        {e.amount_previous && <Tag color={C.platDim}>${e.amount_previous.toLocaleString()} prev.</Tag>}
                        {e.pct_change && <Tag color={e.pct_change > 0 ? C.red : C.ice}>{e.pct_change > 0 ? "+" : ""}{e.pct_change.toFixed(1)}%</Tag>}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// RENT CHART
// ============================================================================
function RentChart({ prices, fmr1br, fmr2br, bedrooms }) {
  if (!prices || prices.length < 2) return (
    <div style={{ height:80, display:"flex", alignItems:"center", justifyContent:"center" }}>
      <M s={{ fontSize:11, color:C.platDim }}>Not enough price history</M>
    </div>
  );

  const fmr = bedrooms <= 1 ? fmr1br : fmr2br;
  const vals = prices.map(p => p.observed_price);
  const min = Math.min(...vals, fmr || Infinity) * 0.95;
  const max = Math.max(...vals, fmr || 0) * 1.05;
  const h = 80;
  const w = 260;

  const toX = (i) => (i / (prices.length - 1)) * w;
  const toY = (v) => h - ((v - min) / (max - min)) * h;

  const path = prices.map((p, i) => `${i===0?"M":"L"}${toX(i).toFixed(1)},${toY(p.observed_price).toFixed(1)}`).join(' ');
  const fmrY = fmr ? toY(fmr).toFixed(1) : null;

  return (
    <div style={{ position:"relative" }}>
      <svg width="100%" viewBox={`0 0 ${w} ${h}`} style={{ overflow:"visible" }}>
        {fmrY && (
          <>
            <line x1={0} x2={w} y1={fmrY} y2={fmrY} stroke={C.ice} strokeWidth={1} strokeDasharray="4 4" opacity={0.5}/>
            <text x={w} y={parseFloat(fmrY)-4} textAnchor="end" style={{ fontFamily:"'DM Mono',monospace", fontSize:8, fill:C.ice, opacity:0.6 }}>HUD FMR</text>
          </>
        )}
        <polyline points={prices.map((p,i)=>`${toX(i)},${toY(p.observed_price)}`).join(' ')}
          fill="none" stroke={C.champ} strokeWidth={1.5} strokeLinecap="round"/>
        {prices.map((p,i) => (
          <circle key={i} cx={toX(i)} cy={toY(p.observed_price)} r={3} fill={C.champ} opacity={0.8}/>
        ))}
      </svg>
      <div style={{ display:"flex", justifyContent:"space-between", marginTop:4 }}>
        <M s={{ fontSize:9, color:C.platDim }}>{new Date(prices[0].observed_at).toLocaleDateString('en-US',{month:'short',year:'2-digit'})}</M>
        <M s={{ fontSize:9, color:C.platDim }}>{new Date(prices[prices.length-1].observed_at).toLocaleDateString('en-US',{month:'short',year:'2-digit'})}</M>
      </div>
    </div>
  );
}

// ============================================================================
// REVIEW CARD
// ============================================================================
function ReviewCard({ review }) {
  const scoreCol = review.score_overall < 4 ? C.red : review.score_overall < 7 ? C.amber : C.ice;
  return (
    <div style={{ background:C.bg3, border:"1px solid rgba(168,162,158,0.08)", borderRadius:10, padding:"14px 16px", marginBottom:10 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:10 }}>
        <div>
          {review.headline && <div style={{ fontSize:13, fontWeight:500, color:C.w, marginBottom:3 }}>{review.headline}</div>}
          <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
            {review.verified_tenant && <Tag color={C.ice}>Verified tenant</Tag>}
            {review.tenancy_start && <M s={{ fontSize:9, color:C.platDim }}>{new Date(review.tenancy_start).getFullYear()}{review.tenancy_end ? "--"+new Date(review.tenancy_end).getFullYear() : "--present"}</M>}
            {review.unit_number && <M s={{ fontSize:9, color:C.platDim }}>Unit {review.unit_number}</M>}
          </div>
        </div>
        <div style={{ textAlign:"right", flexShrink:0 }}>
          <M s={{ fontSize:20, color:scoreCol, display:"block", lineHeight:1 }}>{review.score_overall?.toFixed(1)}</M>
          <M s={{ fontSize:8, color:scoreCol, textTransform:"uppercase", letterSpacing:"0.1em" }}>overall</M>
        </div>
      </div>

      {review.body && (
        <blockquote style={{ fontFamily:"'Playfair Display',serif", fontStyle:"italic", fontSize:13, color:C.ivory, lineHeight:1.7, borderLeft:"2px solid rgba(196,168,130,0.25)", paddingLeft:12, margin:"0 0 10px 0" }}>
          "{review.body}"
        </blockquote>
      )}

      {(review.advertised_rent || review.actual_rent) && (
        <div style={{ display:"flex", gap:10, marginBottom:8 }}>
          {review.advertised_rent && <div><M s={{ fontSize:9, color:C.platDim, display:"block" }}>Listed</M><M s={{ fontSize:12, color:C.plat }}>${review.advertised_rent?.toLocaleString()}</M></div>}
          {review.actual_rent && <div><M s={{ fontSize:9, color:C.platDim, display:"block" }}>Actual</M><M s={{ fontSize:12, color: review.actual_rent > review.advertised_rent ? C.red : C.ice }}>${review.actual_rent?.toLocaleString()}</M></div>}
          {review.renewal_hike_pct && <div><M s={{ fontSize:9, color:C.platDim, display:"block" }}>Renewal hike</M><M s={{ fontSize:12, color:C.red }}>+{review.renewal_hike_pct?.toFixed(1)}%</M></div>}
        </div>
      )}

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"6px 16px" }}>
        {[["Fees",review.score_fee_transparency],["Maintenance",review.score_maintenance],["Conduct",review.score_conduct],["Price accuracy",review.score_price_accuracy]].map(([label,val])=>(
          <div key={label}>
            <div style={{ display:"flex", justifyContent:"space-between", marginBottom:2 }}>
              <M s={{ fontSize:9, color:C.platDim, textTransform:"uppercase", letterSpacing:"0.08em" }}>{label}</M>
              <M s={{ fontSize:9, color:riskColor(val ? 10-val : null) }}>{val?.toFixed(1)}</M>
            </div>
            <ScoreBar val={val}/>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// PROPERTY DETAIL (full page)
// ============================================================================
function PropertyDetail({ prop, onBack, onAPI }) {
  const [activeTab, setActiveTab] = useState("overview");
  const [timelineFilter, setTimelineFilter] = useState("all");

  const timeline = prop.timeline || [];
  const filteredTimeline = timelineFilter === "all"
    ? timeline
    : timeline.filter(e => e.event_category === timelineFilter);

  const col = riskColor(prop.risk_score);
  const allFees = [...new Set((prop.fees || []).map(f => f.fee_type))];
  const openViolations = (prop.violations || []).filter(v => v.status === "open");
  const hasPositives = prop.risk_score >= 7;

  const DETAIL_TABS = ["overview","timeline","reviews","violations","fees","ownership"];

  return (
    <div style={{ background:C.bg, minHeight:"100vh", paddingBottom:80 }}>
      {/* Header */}
      <div style={{ background:C.bg2, borderBottom:"1px solid rgba(168,162,158,0.1)", padding:"0 16px", height:54, display:"flex", alignItems:"center", gap:12, position:"sticky", top:0, zIndex:50 }}>
        <button onClick={onBack} style={{ background:"transparent", border:"none", color:C.plat, cursor:"pointer", padding:4, fontSize:18 }}>{"<"}</button>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:14, fontWeight:500, color:C.w, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{prop.street || prop.canonical_address}</div>
          <M s={{ fontSize:10, color:C.platDim }}>{prop.city}, {prop.state} {prop.zip}</M>
        </div>
        <RiskBadge score={prop.risk_score} size={48}/>
      </div>

      {/* Hero stats */}
      <div style={{ padding:"20px 16px", borderBottom:"1px solid rgba(168,162,158,0.07)" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:16 }}>
          <div>
            <div style={{ fontFamily:"'Playfair Display',serif", fontSize:22, color:C.w, lineHeight:1.15, marginBottom:6 }}>
              {prop.street}
            </div>
            <M s={{ fontSize:11, color:C.plat }}>{prop.city}, {prop.state} {prop.zip}</M>
            {prop.listing_source && <M s={{ fontSize:9, color:C.platDim, display:"block", marginTop:3 }}>via {prop.listing_source}</M>}
          </div>
          <div style={{ textAlign:"right" }}>
            <div style={{ fontFamily:"'Playfair Display',serif", fontSize:24, color:C.champ }}>${prop.current_listed_price?.toLocaleString() || "--"}</div>
            <M s={{ fontSize:9, color:C.platDim }}>per month</M>
          </div>
        </div>

        {/* Meta pills */}
        <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:14 }}>
          <Tag color={C.champ}>{prop.bedrooms}BR - {prop.bathrooms}BA</Tag>
          {prop.sqft && <Tag color={C.plat}>{prop.sqft?.toLocaleString()} sqft</Tag>}
          {prop.property_type && <Tag color={C.plat}>{prop.property_type}</Tag>}
          {prop.year_built && <Tag color={C.plat}>Built {prop.year_built}</Tag>}
          {prop.days_on_market && <Tag color={C.amber}>{prop.days_on_market}d on market</Tag>}
          {prop.listing_status !== "active" && <Tag color={C.platDim}>Listing closed</Tag>}
        </div>

        {/* Risk signal row */}
        <div style={{ display:"flex", gap:0, background:C.bg3, borderRadius:10, overflow:"hidden" }}>
          {[
            ["Risk score",   prop.risk_score?.toFixed(1) || "--", col],
            ["Reviews",      prop.review_count || 0,              C.plat],
            ["Violations",   prop.violation_count || 0,           prop.violation_count > 0 ? C.amber : C.plat],
            ["Evictions",    prop.eviction_count || 0,            prop.eviction_count > 0 ? C.red : C.plat],
          ].map(([label,val,color],i,arr)=>(
            <div key={label} style={{ flex:1, padding:"12px 0", textAlign:"center", borderRight:i<arr.length-1?"1px solid rgba(168,162,158,0.08)":"none" }}>
              <M s={{ fontSize:18, color, display:"block", lineHeight:1, marginBottom:3 }}>{val}</M>
              <M s={{ fontSize:8, letterSpacing:"0.1em", textTransform:"uppercase", color:C.platDim }}>{label}</M>
            </div>
          ))}
        </div>
      </div>

      {/* Sub tabs */}
      <div style={{ display:"flex", overflowX:"auto", borderBottom:"1px solid rgba(168,162,158,0.07)", background:C.bg2 }}>
        {DETAIL_TABS.map(t=>(
          <button key={t} onClick={()=>setActiveTab(t)}
            style={{ fontFamily:"'DM Mono',monospace", fontSize:10, letterSpacing:"0.1em", textTransform:"uppercase", color:activeTab===t?C.champ:C.platDim, background:"transparent", border:"none", padding:"12px 16px", cursor:"pointer", whiteSpace:"nowrap", borderBottom:activeTab===t?"2px solid "+C.champ:"2px solid transparent" }}>
            {t}
          </button>
        ))}
      </div>

      <div style={{ padding:"16px" }}>

        {/* OVERVIEW TAB */}
        {activeTab === "overview" && (
          <div>
            {/* HUD benchmark */}
            {(prop.fmr_1br || prop.fmr_2br) && (
              <div style={{ marginBottom:20 }}>
                <SectionLabel>Rent vs. benchmarks</SectionLabel>
                <div style={{ background:C.bg2, border:"1px solid rgba(168,162,158,0.08)", borderRadius:10, padding:"14px 16px" }}>
                  {prop.current_listed_price && (prop.fmr_1br || prop.fmr_2br) && (() => {
                    const fmr = prop.bedrooms <= 1 ? prop.fmr_1br : prop.fmr_2br;
                    const pct = fmr ? Math.round(((prop.current_listed_price - fmr) / fmr) * 100) : null;
                    const acsPct = prop.tract_median_rent ? Math.round(((prop.current_listed_price - prop.tract_median_rent) / prop.tract_median_rent) * 100) : null;
                    return (
                      <div style={{ display:"flex", gap:16 }}>
                        <div><M s={{ fontSize:9, color:C.platDim, display:"block" }}>HUD FMR {prop.bedrooms<=1?"1BR":"2BR"}</M><M s={{ fontSize:15, color:C.champ }}>${fmr?.toLocaleString()}</M></div>
                        {pct != null && <div><M s={{ fontSize:9, color:C.platDim, display:"block" }}>Listed vs. FMR</M><M s={{ fontSize:15, color:pct>20?C.red:pct>5?C.amber:C.ice }}>{pct>0?"+":""}{pct}%</M></div>}
                        {prop.tract_median_rent && <div><M s={{ fontSize:9, color:C.platDim, display:"block" }}>ACS tract median</M><M s={{ fontSize:15, color:C.champ }}>${prop.tract_median_rent?.toLocaleString()}</M></div>}
                        {acsPct != null && <div><M s={{ fontSize:9, color:C.platDim, display:"block" }}>vs. ACS</M><M s={{ fontSize:15, color:acsPct>25?C.red:acsPct>10?C.amber:C.ice }}>{acsPct>0?"+":""}{acsPct}%</M></div>}
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}

            {/* Rent history chart */}
            {prop.prices?.length >= 2 && (
              <div style={{ marginBottom:20 }}>
                <SectionLabel>Price history</SectionLabel>
                <div style={{ background:C.bg2, border:"1px solid rgba(168,162,158,0.08)", borderRadius:10, padding:"14px 16px" }}>
                  <RentChart prices={prop.prices} fmr1br={prop.fmr_1br} fmr2br={prop.fmr_2br} bedrooms={prop.bedrooms}/>
                </div>
              </div>
            )}

            {/* Score breakdown */}
            {prop.risk && (
              <div style={{ marginBottom:20 }}>
                <SectionLabel>Risk breakdown</SectionLabel>
                <div style={{ background:C.bg2, border:"1px solid rgba(168,162,158,0.08)", borderRadius:10, padding:"14px 16px" }}>
                  {prop.risk.risk_summary && <div style={{ fontSize:13, color:C.ivory, lineHeight:1.6, marginBottom:12 }}>{prop.risk.risk_summary}</div>}
                  {[["Fee transparency score", prop.fee_score],["Habitability score",prop.habitability_score],["Conduct score",prop.conduct_score]].map(([label,val])=>val!=null&&(
                    <div key={label} style={{ marginBottom:10 }}>
                      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                        <M s={{ fontSize:10, color:C.plat }}>{label}</M>
                        <M s={{ fontSize:10, color:riskColor(val) }}>{parseFloat(val).toFixed(1)}</M>
                      </div>
                      <ScoreBar val={parseFloat(val)}/>
                    </div>
                  ))}
                  {prop.risk.risk_confidence && (
                    <M s={{ fontSize:9, color:C.platDim, display:"block", marginTop:8 }}>
                      Confidence: {Math.round(prop.risk.risk_confidence * 100)}% -- based on {prop.review_count} reviews, {prop.violation_count} violations, {prop.eviction_count} evictions
                    </M>
                  )}
                </div>
              </div>
            )}

            {/* Renter types */}
            {prop.accepts_vouchers != null && (
              <div style={{ marginBottom:20 }}>
                <SectionLabel>Who this landlord accepts</SectionLabel>
                <div style={{ background:C.bg2, border:"1px solid rgba(168,162,158,0.08)", borderRadius:10, padding:"14px 16px" }}>
                  <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                    {prop.accepts_vouchers && <Tag color={C.champ}>Vouchers accepted</Tag>}
                    {prop.accepts_pets && <Tag color={C.champ}>Pets OK</Tag>}
                    {prop.accepts_families && <Tag color={C.champ}>Family-friendly</Tag>}
                    {prop.accepts_vouchers === false && <Tag color={C.amber}>No vouchers</Tag>}
                    {prop.min_income_mult >= 3.5 && <Tag color={C.amber}>Strict income req. ({prop.min_income_mult}x)</Tag>}
                  </div>
                </div>
              </div>
            )}

            {/* Top violations preview */}
            {openViolations.length > 0 && (
              <div style={{ marginBottom:20 }}>
                <SectionLabel>Open violations ({openViolations.length})</SectionLabel>
                {openViolations.slice(0,3).map((v,i) => (
                  <div key={i} style={{ background:C.redFaint, border:"1px solid "+C.red+"25", borderRadius:8, padding:"10px 12px", marginBottom:6 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:3 }}>
                      <M s={{ fontSize:9, color:C.red, textTransform:"uppercase", letterSpacing:"0.1em" }}>{v.violation_type} - {v.severity}</M>
                      <M s={{ fontSize:9, color:C.platDim }}>{v.source_agency?.toUpperCase()}</M>
                    </div>
                    {v.description && <div style={{ fontSize:12, color:C.ivory, lineHeight:1.5 }}>{v.description}</div>}
                    <div style={{ display:"flex", gap:8, marginTop:4 }}>
                      {v.issued_date && <M s={{ fontSize:9, color:C.platDim }}>Issued: {new Date(v.issued_date).toLocaleDateString()}</M>}
                      {v.case_number && <M s={{ fontSize:9, color:C.platDim }}>Case: {v.case_number}</M>}
                    </div>
                  </div>
                ))}
                {openViolations.length > 3 && <button onClick={()=>setActiveTab("violations")} style={{ fontFamily:"'DM Mono',monospace", fontSize:10, color:C.gold, background:"transparent", border:"none", cursor:"pointer", padding:0 }}>See all {openViolations.length} violations</button>}
              </div>
            )}

            {/* Owner */}
            {prop.landlord_name && (
              <div style={{ marginBottom:20 }}>
                <SectionLabel>Ownership</SectionLabel>
                <div style={{ background:C.bg2, border:"1px solid rgba(168,162,158,0.08)", borderRadius:10, padding:"14px 16px" }}>
                  <div style={{ fontSize:14, color:C.w, marginBottom:6 }}>{prop.landlord_name}</div>
                  <div style={{ display:"flex", gap:16, flexWrap:"wrap" }}>
                    {prop.landlord_type && <div><M s={{ fontSize:9, color:C.platDim, display:"block" }}>Type</M><Tag color={C.plat}>{prop.landlord_type}</Tag></div>}
                    {prop.landlord_portfolio_risk && <div><M s={{ fontSize:9, color:C.platDim, display:"block" }}>Portfolio risk</M><M s={{ fontSize:13, color:riskColor(prop.landlord_portfolio_risk) }}>{parseFloat(prop.landlord_portfolio_risk).toFixed(1)}</M></div>}
                    {prop.landlord_evictions > 0 && <div><M s={{ fontSize:9, color:C.platDim, display:"block" }}>Total evictions</M><M s={{ fontSize:13, color:C.red }}>{prop.landlord_evictions}</M></div>}
                    {prop.landlord_violations > 0 && <div><M s={{ fontSize:9, color:C.platDim, display:"block" }}>Total violations</M><M s={{ fontSize:13, color:C.amber }}>{prop.landlord_violations}</M></div>}
                    {prop.landlord_verified && <div style={{ paddingTop:12 }}><Tag color={C.ice}>Verified owner</Tag></div>}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TIMELINE TAB */}
        {activeTab === "timeline" && (
          <div>
            <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:16 }}>
              {["all","listing","legal","violation","community","ownership"].map(f=>(
                <button key={f} onClick={()=>setTimelineFilter(f)}
                  style={{ fontFamily:"'DM Mono',monospace", fontSize:9, letterSpacing:"0.1em", textTransform:"uppercase", color:timelineFilter===f?C.bg:C.plat, background:timelineFilter===f?C.champ:"rgba(255,255,255,0.04)", border:"1px solid "+(timelineFilter===f?C.champ:"rgba(168,162,158,0.18)"), padding:"6px 12px", borderRadius:6, cursor:"pointer" }}>
                  {f}
                </button>
              ))}
            </div>
            <Timeline events={filteredTimeline}/>
          </div>
        )}

        {/* REVIEWS TAB */}
        {activeTab === "reviews" && (
          <div>
            {prop.reviews?.length > 0 ? prop.reviews.map(r => <ReviewCard key={r.id} review={r}/>) : (
              <div style={{ padding:"40px 0", textAlign:"center" }}>
                <M s={{ fontSize:12, color:C.platDim }}>No approved reviews yet.</M>
              </div>
            )}
          </div>
        )}

        {/* VIOLATIONS TAB */}
        {activeTab === "violations" && (
          <div>
            {prop.violations?.length > 0 ? prop.violations.map((v,i) => (
              <div key={i} style={{ background:C.bg2, border:"1px solid "+(v.status==="open"?C.red+"25":"rgba(168,162,158,0.08)"), borderRadius:10, padding:"14px 16px", marginBottom:8 }}>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
                  <div>
                    <M s={{ fontSize:9, color:v.status==="open"?C.red:C.plat, textTransform:"uppercase", letterSpacing:"0.1em", display:"block", marginBottom:3 }}>{v.violation_type} -- {v.severity}</M>
                    <Tag color={v.status==="open"?C.red:C.ice}>{v.status}</Tag>
                  </div>
                  <M s={{ fontSize:9, color:C.platDim }}>{v.source_agency?.toUpperCase()}</M>
                </div>
                {v.description && <div style={{ fontSize:12, color:C.ivory, lineHeight:1.55, marginBottom:6 }}>{v.description}</div>}
                <div style={{ display:"flex", gap:12, flexWrap:"wrap" }}>
                  {v.issued_date && <M s={{ fontSize:9, color:C.platDim }}>Issued: {new Date(v.issued_date).toLocaleDateString()}</M>}
                  {v.resolved_date && <M s={{ fontSize:9, color:C.ice }}>Resolved: {new Date(v.resolved_date).toLocaleDateString()}</M>}
                  {v.case_number && <M s={{ fontSize:9, color:C.platDim }}>Case: {v.case_number}</M>}
                  {v.fine_amount && <M s={{ fontSize:9, color:C.amber }}>Fine: ${v.fine_amount.toLocaleString()}</M>}
                </div>
              </div>
            )) : <div style={{ padding:"40px 0", textAlign:"center" }}><M s={{ fontSize:12, color:C.platDim }}>No violations on record.</M></div>}
          </div>
        )}

        {/* FEES TAB */}
        {activeTab === "fees" && (
          <div>
            {prop.fees?.length > 0 ? prop.fees.map((f,i) => (
              <div key={i} style={{ background:C.bg2, border:"1px solid "+C.red+"20", borderRadius:10, padding:"14px 16px", marginBottom:8 }}>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
                  <M s={{ fontSize:10, color:C.red, textTransform:"uppercase", letterSpacing:"0.1em" }}>{FEE_LABELS[f.fee_type] || f.fee_type}</M>
                  <M s={{ fontSize:10, color:C.platDim }}>{f.report_count} report{f.report_count>1?"s":""}</M>
                </div>
                {f.avg_amount && <div style={{ fontSize:13, color:C.ivory, marginBottom:4 }}>Avg. reported: ${parseFloat(f.avg_amount).toFixed(0)}</div>}
                {f.description && <div style={{ fontSize:12, color:C.plat, lineHeight:1.5 }}>{f.description}</div>}
                <div style={{ display:"flex", gap:6, marginTop:6 }}>
                  {f.refundable === false && <Tag color={C.red}>Non-refundable</Tag>}
                  {f.disclosed_upfront === false && <Tag color={C.amber}>Not disclosed upfront</Tag>}
                </div>
              </div>
            )) : <div style={{ padding:"40px 0", textAlign:"center" }}><M s={{ fontSize:12, color:C.platDim }}>No fee reports yet.</M></div>}
          </div>
        )}

        {/* OWNERSHIP TAB */}
        {activeTab === "ownership" && (
          <div>
            <div style={{ background:C.bg2, border:"1px solid rgba(168,162,158,0.08)", borderRadius:10, padding:"16px", marginBottom:12 }}>
              <div style={{ fontSize:15, fontWeight:500, color:C.w, marginBottom:10 }}>{prop.landlord_name || "Unknown"}</div>
              <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                {[["Entity type",prop.landlord_type],["Verified",prop.landlord_verified?"Yes":"Unverified"],["Portfolio risk",prop.landlord_portfolio_risk?.toFixed?.(2)],["Total evictions",prop.landlord_evictions],["Total violations",prop.landlord_violations],["Total flags",prop.landlord_flags]].map(([label,val])=>val!=null&&(
                  <div key={label} style={{ display:"flex", justifyContent:"space-between" }}>
                    <M s={{ fontSize:11, color:C.platDim }}>{label}</M>
                    <M s={{ fontSize:11, color:C.w }}>{val}</M>
                  </div>
                ))}
              </div>
            </div>
            {prop.evictions?.length > 0 && (
              <div>
                <SectionLabel>Eviction history</SectionLabel>
                {prop.evictions.map((e,i) => (
                  <div key={i} style={{ background:C.bg2, border:"1px solid "+C.red+"20", borderRadius:8, padding:"12px 14px", marginBottom:6 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", marginBottom:3 }}>
                      <M s={{ fontSize:10, color:C.red, textTransform:"uppercase" }}>{e.eviction_reason?.replace(/_/g," ") || "Eviction filed"}</M>
                      {e.filing_date && <M s={{ fontSize:9, color:C.platDim }}>{new Date(e.filing_date).toLocaleDateString()}</M>}
                    </div>
                    <div style={{ display:"flex", gap:8 }}>
                      {e.outcome && <Tag color={C.plat}>{e.outcome?.replace(/_/g," ")}</Tag>}
                      {e.case_number && <M s={{ fontSize:9, color:C.platDim }}>Case: {e.case_number}</M>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// SUBMIT REVIEW FORM
// ============================================================================
function SubmitReview({ propertyId, propertyName, onClose, onSuccess }) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    tenancy_start:"", tenancy_end:"", unit_number:"", is_current_tenant:false,
    score_overall:5, score_fee_transparency:5, score_maintenance:5,
    score_conduct:5, score_price_accuracy:5, score_habitability:5,
    headline:"", body:"",
    advertised_rent:"", actual_rent:"", renewal_hike_pct:"",
    fee_reports:[], maintenance_issues:[],
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const update = (k, v) => setForm(f => ({...f, [k]:v}));

  const addFeeReport = () => {
    setForm(f => ({...f, fee_reports:[...f.fee_reports, { fee_type:"application_fee", amount:"", refundable:false, disclosed_upfront:true }]}));
  };

  const submit = async () => {
    if (!form.body || form.body.length < 20) { setError("Review must be at least 20 characters."); return; }
    setSubmitting(true); setError(null);
    try {
      const payload = {
        property_id: propertyId,
        ...form,
        advertised_rent: form.advertised_rent ? parseInt(form.advertised_rent) : undefined,
        actual_rent:     form.actual_rent     ? parseInt(form.actual_rent)     : undefined,
        renewal_hike_pct:form.renewal_hike_pct? parseFloat(form.renewal_hike_pct) : undefined,
      };
      const res = await fetch('/api/reviews', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) });
      if (!res.ok) throw new Error(await res.text());
      onSuccess();
    } catch (e) {
      setError(e.message);
      setSubmitting(false);
    }
  };

  const ScoreSlider = ({ label, field }) => (
    <div style={{ marginBottom:14 }}>
      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
        <M s={{ fontSize:10, color:C.plat, textTransform:"uppercase", letterSpacing:"0.08em" }}>{label}</M>
        <M s={{ fontSize:12, color:riskColor(form[field]) }}>{form[field]}/10</M>
      </div>
      <input type="range" min={1} max={10} step={0.5} value={form[field]}
        onChange={e=>update(field, parseFloat(e.target.value))}
        style={{ width:"100%", accentColor:C.champ }}/>
      <div style={{ display:"flex", justifyContent:"space-between" }}>
        <M s={{ fontSize:8, color:C.red }}>Poor (1)</M>
        <M s={{ fontSize:8, color:C.ice }}>Excellent (10)</M>
      </div>
    </div>
  );

  return (
    <div onClick={onClose} style={{ position:"fixed", inset:0, background:"rgba(8,7,10,0.93)", zIndex:300, display:"flex", alignItems:"flex-end", justifyContent:"center" }}>
      <div onClick={e=>e.stopPropagation()} style={{ background:C.bg2, border:"1px solid rgba(168,162,158,0.14)", borderRadius:"16px 16px 0 0", width:"100%", maxWidth:540, maxHeight:"90vh", overflowY:"auto", padding:"24px 20px" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
          <div>
            <M s={{ fontSize:9, letterSpacing:"0.18em", textTransform:"uppercase", color:C.gold, display:"block", marginBottom:4 }}>Add report -- {step}/3</M>
            <div style={{ fontSize:15, color:C.w }}>{propertyName}</div>
          </div>
          <button onClick={onClose} style={{ fontFamily:"'DM Mono',monospace", fontSize:11, color:C.plat, background:"transparent", border:"1px solid rgba(168,162,158,0.2)", padding:"6px 10px", borderRadius:6, cursor:"pointer" }}>close</button>
        </div>

        {/* Progress */}
        <div style={{ display:"flex", gap:4, marginBottom:20 }}>
          {[1,2,3].map(i=><div key={i} style={{ flex:1, height:2, background:step>=i?C.champ:"rgba(168,162,158,0.15)", borderRadius:1 }}/>)}
        </div>

        {step === 1 && (
          <div>
            <SectionLabel>Tenancy details</SectionLabel>
            <div style={{ display:"flex", gap:10, marginBottom:12 }}>
              <div style={{ flex:1 }}>
                <M s={{ fontSize:9, color:C.platDim, display:"block", marginBottom:4 }}>Move-in date</M>
                <input type="month" value={form.tenancy_start} onChange={e=>update("tenancy_start",e.target.value)}
                  style={{ width:"100%", background:C.bg3, border:"1px solid rgba(168,162,158,0.2)", borderRadius:6, padding:"9px 10px", color:C.w, fontFamily:"'Inter',sans-serif", fontSize:13, outline:"none", boxSizing:"border-box" }}/>
              </div>
              <div style={{ flex:1 }}>
                <M s={{ fontSize:9, color:C.platDim, display:"block", marginBottom:4 }}>Move-out date</M>
                <input type="month" value={form.tenancy_end} onChange={e=>update("tenancy_end",e.target.value)} placeholder="Still here"
                  style={{ width:"100%", background:C.bg3, border:"1px solid rgba(168,162,158,0.2)", borderRadius:6, padding:"9px 10px", color:C.w, fontFamily:"'Inter',sans-serif", fontSize:13, outline:"none", boxSizing:"border-box" }}/>
              </div>
            </div>
            <div style={{ marginBottom:12 }}>
              <M s={{ fontSize:9, color:C.platDim, display:"block", marginBottom:4 }}>Unit number (optional)</M>
              <input value={form.unit_number} onChange={e=>update("unit_number",e.target.value)} placeholder="e.g. 4B"
                style={{ width:"100%", background:C.bg3, border:"1px solid rgba(168,162,158,0.2)", borderRadius:6, padding:"9px 12px", color:C.w, fontFamily:"'Inter',sans-serif", fontSize:13, outline:"none", boxSizing:"border-box" }}/>
            </div>
            <div style={{ marginBottom:16 }}>
              <M s={{ fontSize:9, color:C.platDim, display:"block", marginBottom:4 }}>Advertised rent (listed price)</M>
              <input type="number" value={form.advertised_rent} onChange={e=>update("advertised_rent",e.target.value)} placeholder="$0"
                style={{ width:"100%", background:C.bg3, border:"1px solid rgba(168,162,158,0.2)", borderRadius:6, padding:"9px 12px", color:C.w, fontFamily:"'Inter',sans-serif", fontSize:13, outline:"none", boxSizing:"border-box" }}/>
            </div>
            <div style={{ marginBottom:20 }}>
              <M s={{ fontSize:9, color:C.platDim, display:"block", marginBottom:4 }}>What you actually paid</M>
              <input type="number" value={form.actual_rent} onChange={e=>update("actual_rent",e.target.value)} placeholder="$0"
                style={{ width:"100%", background:C.bg3, border:"1px solid rgba(168,162,158,0.2)", borderRadius:6, padding:"9px 12px", color:C.w, fontFamily:"'Inter',sans-serif", fontSize:13, outline:"none", boxSizing:"border-box" }}/>
            </div>
            <button onClick={()=>setStep(2)} style={{ width:"100%", fontFamily:"'DM Mono',monospace", fontSize:12, color:C.bg, background:C.champ, border:"none", padding:13, borderRadius:8, cursor:"pointer" }}>Next: scores</button>
          </div>
        )}

        {step === 2 && (
          <div>
            <SectionLabel>Rate your experience</SectionLabel>
            <ScoreSlider label="Overall" field="score_overall"/>
            <ScoreSlider label="Fee transparency" field="score_fee_transparency"/>
            <ScoreSlider label="Maintenance" field="score_maintenance"/>
            <ScoreSlider label="Landlord conduct" field="score_conduct"/>
            <ScoreSlider label="Price accuracy" field="score_price_accuracy"/>
            <ScoreSlider label="Habitability" field="score_habitability"/>
            <div style={{ display:"flex", gap:8, marginTop:16 }}>
              <button onClick={()=>setStep(1)} style={{ flex:1, fontFamily:"'DM Mono',monospace", fontSize:11, color:C.plat, background:"rgba(255,255,255,0.05)", border:"1px solid rgba(168,162,158,0.2)", padding:12, borderRadius:8, cursor:"pointer" }}>Back</button>
              <button onClick={()=>setStep(3)} style={{ flex:2, fontFamily:"'DM Mono',monospace", fontSize:12, color:C.bg, background:C.champ, border:"none", padding:13, borderRadius:8, cursor:"pointer" }}>Next: your story</button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div>
            <SectionLabel>Your report</SectionLabel>
            <div style={{ marginBottom:12 }}>
              <M s={{ fontSize:9, color:C.platDim, display:"block", marginBottom:4 }}>Headline (optional)</M>
              <input value={form.headline} onChange={e=>update("headline",e.target.value)} placeholder="e.g. Hidden fees totaled $800 extra at move-in"
                style={{ width:"100%", background:C.bg3, border:"1px solid rgba(168,162,158,0.2)", borderRadius:6, padding:"9px 12px", color:C.w, fontFamily:"'Inter',sans-serif", fontSize:13, outline:"none", boxSizing:"border-box" }}/>
            </div>
            <div style={{ marginBottom:16 }}>
              <M s={{ fontSize:9, color:C.platDim, display:"block", marginBottom:4 }}>Your experience (min 20 chars)</M>
              <textarea value={form.body} onChange={e=>update("body",e.target.value)}
                placeholder="Tell future tenants what you wish you had known before signing..."
                rows={5}
                style={{ width:"100%", background:C.bg3, border:"1px solid rgba(168,162,158,0.2)", borderRadius:6, padding:"10px 12px", color:C.w, fontFamily:"'Playfair Display',serif", fontSize:14, outline:"none", resize:"vertical", boxSizing:"border-box", lineHeight:1.65 }}/>
              <M s={{ fontSize:9, color:C.platDim }}>{form.body.length}/2000</M>
            </div>

            {error && <div style={{ background:C.redFaint, border:"1px solid "+C.red+"30", borderRadius:6, padding:"8px 12px", marginBottom:12 }}><M s={{ fontSize:11, color:C.red }}>{error}</M></div>}

            <div style={{ background:C.bg3, border:"1px solid rgba(168,162,158,0.08)", borderRadius:8, padding:"10px 12px", marginBottom:16 }}>
              <M s={{ fontSize:9, color:C.platDim }}>Your report will be reviewed before publishing. No personal information is collected or stored. Submitter hashes are used only for spam prevention and are not reversible.</M>
            </div>

            <div style={{ display:"flex", gap:8 }}>
              <button onClick={()=>setStep(2)} style={{ flex:1, fontFamily:"'DM Mono',monospace", fontSize:11, color:C.plat, background:"rgba(255,255,255,0.05)", border:"1px solid rgba(168,162,158,0.2)", padding:12, borderRadius:8, cursor:"pointer" }}>Back</button>
              <button onClick={submit} disabled={submitting} style={{ flex:2, fontFamily:"'DM Mono',monospace", fontSize:12, color:C.bg, background:submitting?C.platDim:C.champ, border:"none", padding:13, borderRadius:8, cursor:submitting?"not-allowed":"pointer" }}>
                {submitting ? "Submitting..." : "Submit report"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// SEARCH RESULT CARD
// ============================================================================
function PropCard({ prop, onSelect }) {
  const col = riskColor(prop.risk_score);
  const allFees = prop.reported_fee_types?.filter(Boolean) || [];
  const hasMold  = prop.open_violations > 0;
  const hasGhost = prop.eviction_count > 0;
  const diff = (prop.current_listed_price && prop.fmr_1br)
    ? Math.round(((prop.current_listed_price - (prop.bedrooms<=1?prop.fmr_1br:prop.fmr_2br)) / (prop.bedrooms<=1?prop.fmr_1br:prop.fmr_2br)) * 100)
    : null;

  return (
    <div onClick={()=>onSelect(prop)} style={{ background:C.bg2, border:"1px solid rgba(168,162,158,0.1)", borderRadius:14, padding:16, cursor:"pointer" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:10 }}>
        <div style={{ flex:1, marginRight:12 }}>
          <div style={{ fontSize:15, fontWeight:500, color:C.w, lineHeight:1.3, marginBottom:3 }}>{prop.street}</div>
          <M s={{ fontSize:11, color:C.plat }}>{prop.city}, {prop.state} {prop.zip}</M>
          {prop.listing_source && <M s={{ fontSize:9, color:C.platDim, display:"block" }}>via {prop.listing_source}</M>}
        </div>
        <RiskBadge score={prop.risk_score} size={52}/>
      </div>

      <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:10 }}>
        {prop.current_listed_price && <Tag color={C.champ}>${prop.current_listed_price?.toLocaleString()}/mo</Tag>}
        {prop.bedrooms != null && <Tag color={C.plat}>{prop.bedrooms}BR</Tag>}
        {prop.property_type && <Tag color={C.plat}>{prop.property_type}</Tag>}
        {diff != null && <Tag color={diff>20?C.red:diff>5?C.amber:C.ice}>{diff>0?"+":""}{diff}% vs FMR</Tag>}
        {prop.days_on_market > 30 && <Tag color={C.amber}>{prop.days_on_market}d listed</Tag>}
      </div>

      {allFees.length > 0 && (
        <div style={{ display:"flex", gap:5, flexWrap:"wrap", marginBottom:8 }}>
          {allFees.slice(0,3).map(f=><Tag key={f} color={C.red}>{FEE_LABELS[f]||f}</Tag>)}
          {allFees.length>3 && <Tag color={C.platDim}>+{allFees.length-3} more</Tag>}
        </div>
      )}

      {(prop.open_violations > 0 || prop.eviction_count > 0) && (
        <div style={{ display:"flex", gap:6, marginBottom:8 }}>
          {prop.open_violations > 0 && <Tag color={C.red}>{prop.open_violations} open violation{prop.open_violations>1?"s":""}</Tag>}
          {prop.eviction_count > 0 && <Tag color={C.amber}>{prop.eviction_count} eviction{prop.eviction_count>1?"s":""}</Tag>}
        </div>
      )}

      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", paddingTop:10, borderTop:"1px solid rgba(168,162,158,0.08)" }}>
        <div>
          <M s={{ fontSize:11, color:C.ivory }}>{(prop.landlord_name||"").length>26?(prop.landlord_name||"").slice(0,26)+"...":(prop.landlord_name||"Unknown owner")}</M>
          <div style={{ display:"flex", gap:4, marginTop:2 }}>
            {prop.landlord_type && <M s={{ fontSize:9, color:C.platDim, textTransform:"uppercase" }}>{prop.landlord_type}</M>}
            {prop.landlord_verified && <M s={{ fontSize:9, color:C.ice }}> verified</M>}
          </div>
        </div>
        <M s={{ fontSize:12, color:C.platDim }}>{">"}</M>
      </div>
    </div>
  );
}

// ============================================================================
// NEIGHBORHOOD ANALYTICS
// ============================================================================
function NeighborhoodView({ geoType, geoId, geoName, onBack }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/neighborhoods/${geoType}/${geoId}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [geoType, geoId]);

  if (loading) return <div style={{ padding:32, textAlign:"center" }}><M s={{ fontSize:12, color:C.platDim }}>Loading...</M></div>;
  if (!data) return <div style={{ padding:32, textAlign:"center" }}><M s={{ fontSize:12, color:C.platDim }}>No data found.</M></div>;

  const { stats, topRisk, rentTrend } = data;

  return (
    <div style={{ padding:"16px" }}>
      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:20 }}>
        <button onClick={onBack} style={{ background:"transparent", border:"none", color:C.plat, cursor:"pointer", fontSize:18 }}>{"<"}</button>
        <div>
          <M s={{ fontSize:9, letterSpacing:"0.18em", textTransform:"uppercase", color:C.gold, display:"block" }}>Neighborhood</M>
          <div style={{ fontFamily:"'Playfair Display',serif", fontSize:22, color:C.w }}>{geoName}</div>
        </div>
      </div>

      {stats && (
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:20 }}>
          {[
            ["Median rent", stats.median_listed_rent ? "$"+stats.median_listed_rent?.toLocaleString() : "--"],
            ["Avg risk score", stats.avg_risk_score?.toFixed(1) || "--"],
            ["High risk props", stats.high_risk_count || 0],
            ["YoY rent change", stats.rent_yoy_change_pct ? (stats.rent_yoy_change_pct>0?"+":"")+stats.rent_yoy_change_pct?.toFixed(1)+"%" : "--"],
          ].map(([label,val])=>(
            <div key={label} style={{ background:C.bg2, border:"1px solid rgba(168,162,158,0.08)", borderRadius:10, padding:"14px 16px" }}>
              <div style={{ fontFamily:"'Playfair Display',serif", fontSize:22, color:C.w, marginBottom:4 }}>{val}</div>
              <M s={{ fontSize:9, letterSpacing:"0.1em", textTransform:"uppercase", color:C.plat }}>{label}</M>
            </div>
          ))}
        </div>
      )}

      {rentTrend?.length >= 2 && (
        <div style={{ marginBottom:20 }}>
          <SectionLabel>Rent trend (24 months)</SectionLabel>
          <div style={{ background:C.bg2, border:"1px solid rgba(168,162,158,0.08)", borderRadius:10, padding:"14px 16px" }}>
            <RentChart prices={rentTrend.map(r=>({observed_price:Math.round(r.avg_rent),observed_at:r.month}))} bedrooms={1}/>
          </div>
        </div>
      )}

      {topRisk?.length > 0 && (
        <div>
          <SectionLabel>Highest risk in this area</SectionLabel>
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            {topRisk.map(p=>(
              <div key={p.id} style={{ background:C.bg2, border:"1px solid rgba(168,162,158,0.08)", borderRadius:8, padding:"12px 14px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <div><div style={{ fontSize:13, color:C.w }}>{p.street}</div><M s={{ fontSize:10, color:C.platDim }}>{p.landlord}</M></div>
                <M s={{ fontSize:16, color:riskColor(p.risk_score) }}>{p.risk_score?.toFixed(1)}</M>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// MAIN APP
// ============================================================================
export default function App() {
  const [tab, setTab] = useState("home");
  const [search, setSearch] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sort, setSort] = useState("risk_asc");
  const [detail, setDetail] = useState(null);
  const [detailData, setDetailData] = useState(null);
  const [submitFor, setSubmitFor] = useState(null);
  const [neighborhood, setNeighborhood] = useState(null);
  const [searchQ, setSearchQ] = useState("");

  const doSearch = useCallback(async (q, s) => {
    if (!q?.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&sort=${s||sort}&limit=30`);
      const data = await res.json();
      setResults(data.data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [sort]);

  const openDetail = async (prop) => {
    setDetail(prop);
    setDetailData(null);
    try {
      const res = await fetch(`/api/properties/${prop.id}`);
      const data = await res.json();
      setDetailData(data);
    } catch (e) { console.error(e); }
  };

  if (detail) {
    return (
      <div style={{ background:C.bg, minHeight:"100vh", fontFamily:"'Inter',system-ui,sans-serif", WebkitFontSmoothing:"antialiased", color:C.w }}>
        <PropertyDetail
          prop={detailData || detail}
          onBack={()=>{ setDetail(null); setDetailData(null); }}
          onAPI={()=>{}}
        />
        {detailData && (
          <div style={{ position:"fixed", bottom:16, right:16, zIndex:100 }}>
            <button onClick={()=>setSubmitFor(detail)}
              style={{ fontFamily:"'DM Mono',monospace", fontSize:11, letterSpacing:"0.08em", color:C.bg, background:C.champ, border:"none", padding:"12px 20px", borderRadius:10, cursor:"pointer", boxShadow:"0 4px 20px rgba(0,0,0,0.4)" }}>
              + Add report
            </button>
          </div>
        )}
        {submitFor && (
          <SubmitReview
            propertyId={submitFor.id}
            propertyName={submitFor.street}
            onClose={()=>setSubmitFor(null)}
            onSuccess={()=>{ setSubmitFor(null); openDetail(detail); }}
          />
        )}
      </div>
    );
  }

  if (neighborhood) {
    return (
      <div style={{ background:C.bg, minHeight:"100vh", fontFamily:"'Inter',system-ui,sans-serif", WebkitFontSmoothing:"antialiased", color:C.w, paddingBottom:72 }}>
        <div style={{ background:C.bg2, borderBottom:"1px solid rgba(168,162,158,0.1)", padding:"0 16px", height:54, display:"flex", alignItems:"center", position:"sticky", top:0, zIndex:50 }}>
          <M s={{ fontSize:14, letterSpacing:"0.1em", textTransform:"uppercase", color:C.w }}>Threshold</M>
        </div>
        <NeighborhoodView {...neighborhood} onBack={()=>setNeighborhood(null)}/>
        <BottomTabs tab={tab} setTab={setTab}/>
      </div>
    );
  }

  const TABS = [
    { id:"home",   label:"Home"    },
    { id:"search", label:"Search"  },
    { id:"saved",  label:"Saved"   },
    { id:"report", label:"Report"  },
  ];

  function BottomTabs({ tab, setTab }) {
    return (
      <div style={{ position:"fixed", bottom:0, left:0, right:0, zIndex:100, background:"rgba(17,16,24,0.97)", borderTop:"1px solid rgba(168,162,158,0.12)", backdropFilter:"blur(20px)", display:"flex", height:64 }}>
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:4, background:"transparent", border:"none", cursor:"pointer", padding:0, position:"relative" }}>
            <M s={{ fontSize:9, letterSpacing:"0.1em", textTransform:"uppercase", color:tab===t.id?C.champ:C.platDim }}>{t.label}</M>
            {tab===t.id && <div style={{ position:"absolute", bottom:0, width:28, height:2, background:C.champ, borderRadius:1 }}/>}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div style={{ background:C.bg, minHeight:"100vh", fontFamily:"'Inter',system-ui,sans-serif", WebkitFontSmoothing:"antialiased", color:C.w, paddingBottom:72 }}>

      {/* Top bar */}
      <div style={{ background:C.bg2, borderBottom:"1px solid rgba(168,162,158,0.1)", padding:"0 16px", height:54, display:"flex", alignItems:"center", justifyContent:"space-between", position:"sticky", top:0, zIndex:50 }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <div style={{ width:18, height:18, borderRadius:"50%", border:"1.5px solid "+C.gold, display:"flex", alignItems:"center", justifyContent:"center" }}>
            <div style={{ width:5, height:5, borderRadius:"50%", background:C.gold }}/>
          </div>
          <M s={{ fontSize:14, letterSpacing:"0.1em", textTransform:"uppercase", color:C.w }}>Threshold</M>
        </div>
        <M s={{ fontSize:9, color:C.platDim }}>Rental intelligence</M>
      </div>

      {/* HOME */}
      {tab === "home" && (
        <div>
          <div style={{ padding:"32px 20px 24px", borderBottom:"1px solid rgba(168,162,158,0.07)" }}>
            <M s={{ fontSize:9, letterSpacing:"0.22em", textTransform:"uppercase", color:C.gold, display:"block", marginBottom:14 }}>Real tenant reviews -- Free forever</M>
            <div style={{ fontFamily:"'Playfair Display',serif", fontSize:34, fontWeight:400, color:C.w, lineHeight:1.05, marginBottom:16 }}>
              Know before<br/><span style={{ fontStyle:"italic", color:C.champ }}>you sign.</span>
            </div>
            <div style={{ fontSize:14, color:C.plat, lineHeight:1.7, fontWeight:300, marginBottom:24 }}>
              Ghost rates. Hidden fees. Mold. Violations. Evictions. Check any landlord or property before they get your money.
            </div>
            <div style={{ position:"relative" }}>
              <input value={searchQ} onChange={e=>setSearchQ(e.target.value)}
                onKeyDown={e=>{ if(e.key==="Enter"&&searchQ.trim()){ setSearch(searchQ); setTab("search"); doSearch(searchQ); }}}
                placeholder="Search any landlord, building, or address..."
                style={{ width:"100%", background:"rgba(255,255,255,0.05)", border:"1px solid rgba(168,162,158,0.25)", borderRadius:12, padding:"15px 70px 15px 18px", fontFamily:"'Inter',sans-serif", fontSize:15, color:C.w, outline:"none", boxSizing:"border-box" }}/>
              <button onClick={()=>{ if(searchQ.trim()){ setSearch(searchQ); setTab("search"); doSearch(searchQ); }}}
                style={{ position:"absolute", right:8, top:"50%", transform:"translateY(-50%)", fontFamily:"'DM Mono',monospace", fontSize:11, color:C.bg, background:C.champ, border:"none", padding:"9px 16px", borderRadius:8, cursor:"pointer" }}>Check</button>
            </div>
            <div style={{ display:"flex", gap:20, marginTop:10 }}>
              {["100% anonymous","No account","Free forever"].map(t=><M key={t} s={{ fontSize:9, color:"rgba(168,162,158,0.35)" }}>{t}</M>)}
            </div>
          </div>

          <div style={{ padding:"20px" }}>
            <SectionLabel>Browse by neighborhood</SectionLabel>
            <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
              {[
                ["zip","90013","Arts District"],
                ["zip","90027","Silver Lake"],
                ["zip","90005","Koreatown"],
                ["zip","90026","Echo Park"],
                ["zip","90016","Mid-City"],
                ["zip","90703","Cerritos"],
              ].map(([type,id,name])=>(
                <button key={id} onClick={()=>setNeighborhood({geoType:type,geoId:id,geoName:name})}
                  style={{ background:C.bg2, border:"1px solid rgba(168,162,158,0.1)", borderRadius:10, padding:"12px 16px", display:"flex", justifyContent:"space-between", alignItems:"center", cursor:"pointer", textAlign:"left" }}>
                  <div>
                    <div style={{ fontSize:14, color:C.w }}>{name}</div>
                    <M s={{ fontSize:10, color:C.platDim }}>{id}</M>
                  </div>
                  <M s={{ fontSize:12, color:C.platDim }}>{">"}</M>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* SEARCH */}
      {tab === "search" && (
        <div>
          <div style={{ padding:"12px 16px", borderBottom:"1px solid rgba(168,162,158,0.07)" }}>
            <div style={{ position:"relative", marginBottom:8 }}>
              <input value={search} onChange={e=>setSearch(e.target.value)}
                onKeyDown={e=>{ if(e.key==="Enter") doSearch(search); }}
                placeholder="Search address, landlord, ZIP..."
                style={{ width:"100%", background:"rgba(255,255,255,0.05)", border:"1px solid rgba(168,162,158,0.18)", borderRadius:8, padding:"11px 50px 11px 14px", fontFamily:"'Inter',sans-serif", fontSize:14, color:C.w, outline:"none", boxSizing:"border-box" }}/>
              <button onClick={()=>doSearch(search)} style={{ position:"absolute", right:6, top:"50%", transform:"translateY(-50%)", fontFamily:"'DM Mono',monospace", fontSize:10, color:C.bg, background:C.champ, border:"none", padding:"7px 12px", borderRadius:6, cursor:"pointer" }}>Go</button>
            </div>
            <div style={{ display:"flex", gap:6, overflowX:"auto" }}>
              {[["risk_asc","^ Risk"],["risk_desc","v Risk"],["price_asc","^ Price"],["price_desc","v Price"],["recent","Recent"]].map(([val,label])=>(
                <button key={val} onClick={()=>{ setSort(val); doSearch(search, val); }}
                  style={{ fontFamily:"'DM Mono',monospace", fontSize:9, letterSpacing:"0.08em", color:sort===val?C.bg:C.plat, background:sort===val?C.champ:"rgba(255,255,255,0.04)", border:"1px solid "+(sort===val?C.champ:"rgba(168,162,158,0.18)"), padding:"6px 12px", borderRadius:6, cursor:"pointer", whiteSpace:"nowrap", flexShrink:0 }}>{label}</button>
              ))}
            </div>
          </div>
          <div style={{ padding:"12px 16px" }}>
            {loading && <div style={{ padding:"40px 0", textAlign:"center" }}><M s={{ fontSize:12, color:C.platDim }}>Searching...</M></div>}
            {!loading && results.length === 0 && search && (
              <div style={{ padding:"40px 0", textAlign:"center" }}>
                <div style={{ fontFamily:"'Playfair Display',serif", fontSize:18, color:C.ivory, marginBottom:8 }}>No results found.</div>
                <M s={{ fontSize:12, color:C.platDim }}>Try a different address, landlord name, or ZIP code.</M>
              </div>
            )}
            {!loading && results.length === 0 && !search && (
              <div style={{ padding:"40px 20px", textAlign:"center" }}>
                <M s={{ fontSize:12, color:C.platDim }}>Search any address, landlord, or building to see tenant reports, violations, and risk scores.</M>
              </div>
            )}
            <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
              {results.map(p=><PropCard key={p.id} prop={p} onSelect={openDetail}/>)}
            </div>
          </div>
        </div>
      )}

      {/* SAVED */}
      {tab === "saved" && (
        <div style={{ padding:"32px 20px", textAlign:"center" }}>
          <div style={{ fontFamily:"'Playfair Display',serif", fontSize:20, color:C.ivory, marginBottom:8 }}>Saved properties</div>
          <M s={{ fontSize:12, color:C.platDim }}>Sign in coming soon. Properties you flag will appear here.</M>
        </div>
      )}

      {/* REPORT */}
      {tab === "report" && (
        <div style={{ padding:"24px 20px" }}>
          <M s={{ fontSize:9, letterSpacing:"0.2em", textTransform:"uppercase", color:C.gold, display:"block", marginBottom:12 }}>Add a report</M>
          <div style={{ fontFamily:"'Playfair Display',serif", fontSize:22, color:C.w, marginBottom:8 }}>Tell the next tenant what you know.</div>
          <div style={{ fontSize:13, color:C.plat, lineHeight:1.7, marginBottom:24 }}>Search for the property first, then tap "Add report" on the listing.</div>
          <button onClick={()=>setTab("search")} style={{ width:"100%", fontFamily:"'DM Mono',monospace", fontSize:12, color:C.bg, background:C.champ, border:"none", padding:14, borderRadius:10, cursor:"pointer" }}>Search for a property</button>
        </div>
      )}

      <BottomTabs tab={tab} setTab={setTab}/>
    </div>
  );
}
