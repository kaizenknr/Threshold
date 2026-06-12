// Shared security helpers — imported by every API route
// NOT a Vercel route (files starting with _ are ignored by Vercel router)

// ─── In-memory rate limiter ────────────────────────────────────────────────
// Per-instance; resets on cold start. Catches burst abuse on warm instances.
const _rl = new Map();
const RL_WINDOW = 3_600_000; // 1 hour

export function checkRateLimit(ip, endpoint, limit) {
  const key = `${endpoint}:${ip.slice(0, 45)}`;
  const now = Date.now();
  const entry = _rl.get(key);
  if (!entry || now - entry.w > RL_WINDOW) {
    _rl.set(key, { n: 1, w: now });
    // Periodic cleanup to prevent unbounded growth
    if (_rl.size > 8000) {
      for (const [k, v] of _rl) if (now - v.w > RL_WINDOW) _rl.delete(k);
    }
    return true;
  }
  if (entry.n >= limit) return false;
  entry.n++;
  return true;
}

export function getClientIP(req) {
  return (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
    || req.socket?.remoteAddress
    || '0.0.0.0';
}

// ─── CORS ──────────────────────────────────────────────────────────────────
// Respects ALLOWED_ORIGINS env var (comma-separated). Falls back to * in dev.
export function setCORSHeaders(req, res) {
  const origin = req.headers.origin || '';
  const raw = process.env.ALLOWED_ORIGINS || '';
  const allowed = raw ? raw.split(',').map(s => s.trim()).filter(Boolean) : [];
  const allow = !allowed.length || allowed.includes(origin) ? (origin || '*') : allowed[0];
  res.setHeader('Access-Control-Allow-Origin', allow);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Vary', 'Origin');
}

// ─── Security response headers ─────────────────────────────────────────────
export function setSecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  // X-XSS-Protection is deprecated in modern browsers; CSP is the replacement
  // We set it for legacy browser compatibility
  res.setHeader('X-XSS-Protection', '1; mode=block');
}

// ─── Prompt injection defense ──────────────────────────────────────────────
// Strip control characters, newlines, and known prompt-break sequences from
// any string that will be embedded in a Claude prompt.
export function sanitizeForPrompt(str, maxLen = 300) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/[\x00-\x1F\x7F]/g, ' ')           // strip all control chars (incl. \n, \r, \t)
    .replace(/\{\{|\}\}/g, ' ')                   // strip template injection patterns
    .replace(/system\s*:/gi, ' ')                 // strip role injection attempts
    .replace(/user\s*:/gi, ' ')
    .replace(/assistant\s*:/gi, ' ')
    .replace(/\bignore\s+(all\s+)?(previous|above|prior)\b/gi, ' ') // strip classic injection
    .replace(/<\|.*?\|>/g, ' ')                   // strip model-specific tokens
    .trim()
    .slice(0, maxLen);
}

// Sanitize an array of strings for use in prompts
export function sanitizeArrayForPrompt(arr, maxItems = 10, maxLen = 100) {
  if (!Array.isArray(arr)) return [];
  return arr.slice(0, maxItems).map(s => sanitizeForPrompt(s, maxLen)).filter(Boolean);
}

// ─── UUID validation ───────────────────────────────────────────────────────
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUUID = s => typeof s === 'string' && UUID_RE.test(s);
export const filterUUIDs = arr => (arr || []).filter(isUUID);

// ─── Body parsing ──────────────────────────────────────────────────────────
export function parseBody(req) {
  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch (_) { b = {}; } }
  return b || {};
}
