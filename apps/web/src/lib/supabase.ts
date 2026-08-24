import { createClient } from "@supabase/supabase-js";

// Public, client-safe values only. All actual data access happens through
// Edge Functions (see src/lib/api.ts) — this client is used purely as a
// convenient, correctly-routed transport for calling them.
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL as string,
  import.meta.env.VITE_SUPABASE_ANON_KEY as string,
);
