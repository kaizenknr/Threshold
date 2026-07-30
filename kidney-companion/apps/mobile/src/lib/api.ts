import { createApiClient } from "@kidney/shared";
import { supabase } from "./supabaseClient";

export const api = createApiClient({
  baseUrl: process.env.EXPO_PUBLIC_API_BASE_URL!,
  getToken: async () => {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  },
});
