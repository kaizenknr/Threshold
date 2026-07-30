import { createApiClient } from "@kidney/shared";
import { supabase } from "./supabaseClient.js";

/** Typed Server API client that attaches the current Supabase session JWT. */
export const api = createApiClient({
  baseUrl: process.env.NEXT_PUBLIC_API_BASE_URL!,
  getToken: async () => {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  },
});
