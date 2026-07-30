import { createClient } from "@supabase/supabase-js";

// Anon key only — safe to expose; RLS enforces per-user access. The
// service-role key must NEVER appear in this (or any) client bundle.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(url, anonKey);
