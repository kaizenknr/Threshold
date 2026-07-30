import "../server-only.js";
import { createClient } from "@supabase/supabase-js";
import { env } from "../env.js";

/**
 * Service-role client — bypasses RLS. The ONLY place the service-role key is
 * used. Never expose this client or its key to any client bundle. Use it for
 * audited writes, seeding, and reading private storage on behalf of an
 * already-authenticated user (whose id you verified via the auth middleware).
 */
export const supabaseAdmin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/**
 * Verify a Supabase user JWT and return the user id, or null if invalid.
 * getUser() validates the token signature and expiry against the project.
 */
export async function verifyUserJwt(jwt: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin.auth.getUser(jwt);
  if (error || !data.user) return null;
  return data.user.id;
}
