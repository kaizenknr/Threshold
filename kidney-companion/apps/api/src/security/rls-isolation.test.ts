import { describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";

/**
 * RLS isolation test (BUILD_SPEC §16, top compliance item):
 * user B must NOT be able to read user A's rows.
 *
 * Runs only when pointed at a real Supabase project with two pre-provisioned
 * test users' access tokens — so it never blocks CI, but is ready to run in a
 * staging pipeline before any public launch:
 *
 *   RLS_TEST_SUPABASE_URL=...        RLS_TEST_ANON_KEY=...
 *   RLS_TEST_TOKEN_A=<user A JWT>    RLS_TEST_TOKEN_B=<user B JWT>
 *   pnpm --filter @kidney/api test
 */
const url = process.env.RLS_TEST_SUPABASE_URL;
const anon = process.env.RLS_TEST_ANON_KEY;
const tokenA = process.env.RLS_TEST_TOKEN_A;
const tokenB = process.env.RLS_TEST_TOKEN_B;
const configured = Boolean(url && anon && tokenA && tokenB);

const clientFor = (jwt: string) =>
  createClient(url!, anon!, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });

describe.skipIf(!configured)("RLS isolation — a user cannot read another user's rows", () => {
  it("user A writes a food_log row that user B cannot see", async () => {
    const a = clientFor(tokenA!);
    const b = clientFor(tokenB!);

    const { data: aUser } = await a.auth.getUser();
    const aId = aUser.user!.id;

    const inserted = await a
      .from("food_log")
      .insert({ user_id: aId, label: "rls-probe", estimated: true })
      .select("id")
      .single();
    expect(inserted.error).toBeNull();
    const rowId = inserted.data!.id;

    try {
      // B queries the exact row id — RLS must return zero rows, not the data.
      const seen = await b.from("food_log").select("id").eq("id", rowId);
      expect(seen.error).toBeNull();
      expect(seen.data).toHaveLength(0);

      // B also cannot update or delete it.
      const upd = await b.from("food_log").update({ label: "hijacked" }).eq("id", rowId).select("id");
      expect(upd.data ?? []).toHaveLength(0);
    } finally {
      await a.from("food_log").delete().eq("id", rowId);
    }
  });
});
