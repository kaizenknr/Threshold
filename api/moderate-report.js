import {
  checkRateLimit, getClientIP, setCORSHeaders, setSecurityHeaders, parseBody,
} from './_security.js';

export default async function handler(req, res) {
  setCORSHeaders(req, res);
  setSecurityHeaders(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end('Method not allowed');

  // Rate limit: 30 moderation checks per IP per hour
  const ip = getClientIP(req);
  if (!checkRateLimit(ip, 'moderate', 30)) {
    return res.status(429).json({ error: 'Too many requests. Try again later.' });
  }

  const body = parseBody(req);
  const landlord = String(body.landlord || '').trim().slice(0, 200);
  const city     = String(body.city     || '').trim().slice(0, 200);
  const experience_text = String(body.experience_text || '').trim().slice(0, 2000);

  if (!landlord || !city) return res.status(400).json({ error: 'landlord and city required' });

  const results = { ok: true, city_valid: true, city_normalized: city, content_ok: true, flags: [] };

  // Validate city via Nominatim (fail open)
  try {
    const geoRes = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(city)}&format=json&limit=1&addressdetails=1`,
      { headers: { 'User-Agent': 'Threshold-RentalTransparency/1.0' }, signal: AbortSignal.timeout(6000) }
    );
    if (geoRes.ok) {
      const geoData = await geoRes.json();
      if (!geoData?.length) {
        results.city_valid = false;
        results.flags.push('city_not_found');
      } else {
        const addr = geoData[0].address || {};
        const parts = [addr.city || addr.town || addr.village || addr.county, addr.state].filter(Boolean);
        if (parts.length) results.city_normalized = parts.join(', ');
      }
    }
  } catch (_e) {}

  // Content moderation via Claude (fail open)
  const ANTHROPIC_KEY = process.env.ANTHROPIC_KEY;
  if (ANTHROPIC_KEY && experience_text) {
    try {
      const modRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 200,
          system: 'You are a content moderator for a rental transparency platform. Return ONLY valid JSON.',
          messages: [{
            role: 'user',
            content: `Review this tenant report. Flag ONLY: personal info (names/phones/addresses of individuals), hate speech, slurs, or gibberish. Do NOT flag negative opinions of landlords or strong language about a company.

Text: "${experience_text.slice(0, 1000)}"

Return ONLY: {"ok":true|false,"reason":"string or null"}`
          }],
        }),
        signal: AbortSignal.timeout(10000),
      });
      if (modRes.ok) {
        const d = await modRes.json();
        const txt = (d.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
        const m = txt.match(/\{[\s\S]*\}/);
        if (m) {
          const p = JSON.parse(m[0]);
          if (!p.ok) { results.content_ok = false; results.flags.push(p.reason || 'content_violation'); }
        }
      }
    } catch (_e) {}
  }

  results.ok = results.city_valid && results.content_ok;
  return res.status(200).json(results);
}
