import {
  checkRateLimit, getClientIP, setCORSHeaders, setSecurityHeaders, parseBody,
} from './_security.js';

export default async function handler(req, res) {
  setCORSHeaders(req, res);
  setSecurityHeaders(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end('Method not allowed');

  const ip = getClientIP(req);
  if (!checkRateLimit(ip, 'property-data', 20)) {
    return res.status(429).json({ error: 'Too many requests. Try again later.' });
  }

  const body = parseBody(req);
  const address = String(body.address || '').trim().slice(0, 300);
  if (!address) return res.status(400).json({ error: 'address required' });

  const RENTCAST_KEY  = process.env.RENTCAST_KEY;
  const ESTATED_TOKEN = process.env.ESTATED_TOKEN;
  const WALKSCORE_KEY = process.env.WALKSCORE_KEY;

  const result = { ok: true, address, normalized_address: address, owner: null, property: null, rent_estimate: null, walk_score: null };

  // Step 1: Geocode via Nominatim to get lat/lon + normalized address
  let lat = null, lon = null;
  try {
    const geoRes = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1&addressdetails=1`,
      { headers: { 'User-Agent': 'Threshold-RentalTransparency/1.0' }, signal: AbortSignal.timeout(6000) }
    );
    if (geoRes.ok) {
      const geoData = await geoRes.json();
      if (geoData?.[0]) {
        lat = parseFloat(geoData[0].lat);
        lon = parseFloat(geoData[0].lon);
        const addr = geoData[0].address || {};
        const street = [addr.house_number, addr.road].filter(Boolean).join(' ');
        const parts = [street, addr.city || addr.town || addr.village, addr.state, addr.postcode].filter(Boolean);
        if (parts.length) result.normalized_address = parts.join(', ');
      }
    }
  } catch (_e) {}

  // Steps 2-4: parallel fetch from all three sources
  await Promise.allSettled([

    // Estated — ownership + property details
    ESTATED_TOKEN ? (async () => {
      try {
        const r = await fetch(
          `https://apis.estated.com/v4/property?token=${encodeURIComponent(ESTATED_TOKEN)}&combined_input=${encodeURIComponent(result.normalized_address)}`,
          { signal: AbortSignal.timeout(8000) }
        );
        if (!r.ok) return;
        const d = await r.json();
        const prop = d?.data;
        if (!prop) return;
        const o = prop.owner || {};
        const ownerName = String(o.name || (o.first_name ? `${o.first_name} ${o.last_name || ''}`.trim() : '') || '').slice(0, 200);
        result.owner = {
          name: ownerName || null,
          mailing_address: String(o.mailing_address?.formatted_street_address || '').slice(0, 300) || null,
        };
        const s = prop.structure || {};
        const deeds = prop.deeds || [];
        result.property = {
          bedrooms:        s.beds_count ?? null,
          bathrooms:       s.baths ?? null,
          sqft:            s.living_square_footage ?? null,
          year_built:      s.year_built ?? null,
          property_type:   String(prop.parcel?.location_descriptions?.[0] || '').slice(0, 100) || null,
          last_sale_date:  String(deeds[0]?.document_date || '').slice(0, 20) || null,
          last_sale_amount: deeds[0]?.sale_amount ?? null,
        };
      } catch (_e) {}
    })() : Promise.resolve(),

    // RentCast — rent estimate
    RENTCAST_KEY ? (async () => {
      try {
        const params = new URLSearchParams({ address: result.normalized_address });
        const r = await fetch(
          `https://api.rentcast.io/v1/avm/rent/long-term?${params}`,
          { headers: { 'X-Api-Key': RENTCAST_KEY, Accept: 'application/json' }, signal: AbortSignal.timeout(8000) }
        );
        if (!r.ok) return;
        const d = await r.json();
        result.rent_estimate = {
          rent:             d.rent           ?? null,
          rent_range_low:   d.rentRangeLow   ?? null,
          rent_range_high:  d.rentRangeHigh  ?? null,
          comparables:      (d.comparables || []).slice(0, 5).map(c => ({
            address:    String(c.address || '').slice(0, 200),
            rent:       c.price ?? null,
            bedrooms:   c.bedrooms ?? null,
            bathrooms:  c.bathrooms ?? null,
            distance:   c.distance ?? null,
          })),
        };
      } catch (_e) {}
    })() : Promise.resolve(),

    // Walk Score — walkability / transit / bike
    WALKSCORE_KEY && lat !== null && lon !== null ? (async () => {
      try {
        const params = new URLSearchParams({
          format: 'json',
          address: result.normalized_address,
          lat: String(lat),
          lon: String(lon),
          wsapikey: WALKSCORE_KEY,
          transit: '1',
          bike: '1',
        });
        const r = await fetch(
          `https://api.walkscore.com/score?${params}`,
          { signal: AbortSignal.timeout(8000) }
        );
        if (!r.ok) return;
        const d = await r.json();
        result.walk_score = {
          walk:                 d.walkscore ?? null,
          walk_description:     String(d.description || '').slice(0, 100) || null,
          transit:              d.transit?.score ?? null,
          transit_description:  String(d.transit?.description || '').slice(0, 100) || null,
          bike:                 d.bike?.score ?? null,
          bike_description:     String(d.bike?.description || '').slice(0, 100) || null,
        };
      } catch (_e) {}
    })() : Promise.resolve(),

  ]);

  return res.status(200).json(result);
}
