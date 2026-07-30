/**
 * Import this at the top of any module that touches a server-only secret
 * (ANTHROPIC_API_KEY, SUPABASE_SERVICE_ROLE_KEY). If a bundler ever pulls one
 * of these modules into a browser/Expo build, the missing Node globals make
 * the build fail loudly instead of shipping a key to a client.
 */
if (typeof process === "undefined" || !process.versions?.node) {
  throw new Error(
    "server-only module imported outside a Node server environment — a secret was about to reach a client bundle.",
  );
}
