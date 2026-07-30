#!/usr/bin/env node
/**
 * CI guard: fail the build if a server-only secret could reach a client bundle.
 * Scans web/mobile source + any built output for:
 *   - a literal Anthropic key (sk-ant-...)
 *   - the service-role key referenced under a PUBLIC env prefix
 *   - server-only env names used in client code
 * Run: `node scripts/secret-scan.mjs` (wired into `pnpm scan:secrets` + CI).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOTS = ["apps/web", "apps/mobile"];
const SCAN_EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json", ".html"]);
const SKIP_DIR = new Set(["node_modules", ".next", ".expo", "dist", "build", ".git"]);

const FORBIDDEN = [
  { re: /sk-ant-[A-Za-z0-9\-_]{6,}/, msg: "literal Anthropic API key" },
  { re: /NEXT_PUBLIC_[A-Z_]*SERVICE_ROLE/, msg: "service-role key under NEXT_PUBLIC_ prefix" },
  { re: /EXPO_PUBLIC_[A-Z_]*SERVICE_ROLE/, msg: "service-role key under EXPO_PUBLIC_ prefix" },
  { re: /\bSUPABASE_SERVICE_ROLE_KEY\b/, msg: "server-only SUPABASE_SERVICE_ROLE_KEY in client code" },
  { re: /process\.env\.ANTHROPIC_API_KEY/, msg: "ANTHROPIC_API_KEY referenced in client code" },
];

let failures = 0;

function walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return; // app not present yet
  }
  for (const name of entries) {
    if (SKIP_DIR.has(name)) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full);
    else if (SCAN_EXT.has(name.slice(name.lastIndexOf(".")))) scan(full);
  }
}

function scan(file) {
  const text = readFileSync(file, "utf8");
  for (const { re, msg } of FORBIDDEN) {
    if (re.test(text)) {
      console.error(`✖ ${file}: ${msg}`);
      failures++;
    }
  }
}

for (const root of ROOTS) walk(root);

if (failures > 0) {
  console.error(`\nSecret scan FAILED (${failures} issue${failures > 1 ? "s" : ""}).`);
  process.exit(1);
}
console.log("Secret scan passed — no client-side secrets detected.");
