import { createClient } from "npm:@supabase/supabase-js@2";

// Service-role client. Used exclusively inside Edge Functions, never exposed
// to the browser. Bypasses RLS by design — every query below MUST filter by
// the authenticated user_id explicitly.
export function supabaseAdmin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}
