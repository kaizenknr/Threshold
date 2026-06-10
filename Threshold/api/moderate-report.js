// Content moderation for tenant reports
// Checks: fake content, hate speech, personal doxxing, validates city via Nominatim

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end('Method not allowed');

  let body = req.body;
  if (typeof body === 'string') try { body = JSON.parse(body); } catch (e) { body = {}; }
  body = body || {};

  const { landlord, city, experience_text } = body;
  if (!landlord || !city) return res.status(400).json({ error: 'landlord and city required' });

  const results = { ok: true, city_valid: true, city_normalized: city, content_ok: true, flags: [] };

  // ── 1. Validate city via Nominatim ────────────────────────────────────────────
  try {
    const geoRes = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(city)}&format=json&limit=1&addressdetails=1`,
      { headers: { 'User-Agent': 'Vett-RentalTransparency/1.0' } }
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

  // ── 2. Content moderation via Claude ─────────────────────────────────────────
  const ANTHROPIC_KEY = process.env.ANTHROPIC_KEY;
  if (ANTHROPIC_KEY && experience_text?.trim()) {
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
          system: 'You are a content moderator for a rental transparency platform. Check if the text violates guidelines. Return ONLY valid JSON.',
          messages: [{
            role: 'user',
            content: `Review this tenant report text. Check for: personal info (full names, phone numbers, addresses of individuals), hate speech, slurs, fake/gibberish content, personal attacks on individuals (not companies).

Text: "${experience_text.slice(0, 1000)}"

Return ONLY: {"ok":true|false,"reason":"string or null","corrected":"slightly improved version or null"}`
          }],
        })
      });
      if (modRes.ok) {
        const d = await modRes.json();
        const txt = (d.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
        const m = txt.match(/\{[\s\S]*\}/);
        if (m) {
          const p = JSON.parse(m[0]);
          if (!p.ok) {
            results.content_ok = false;
            results.flags.push(p.reason || 'content_violation');
          }
          if (p.corrected) results.corrected_text = p.corrected;
        }
      }
    } catch (_e) {}
  }

  results.ok = results.city_valid && results.content_ok;
  return res.status(200).json(results);
}
