import { handleOptions, json } from "./_shared/cors.ts";
import { requireSession } from "./_shared/auth.ts";
import { supabaseAdmin } from "./_shared/supabaseAdmin.ts";

const BUCKET = "vault-files";

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;
  const session = await requireSession(req);
  if (!session) return json({ error: "unauthorized" }, 401);

  const url = new URL(req.url);
  const itemId = url.searchParams.get("item_id");
  if (!itemId) return json({ error: "missing_item_id" }, 400);

  const supabase = supabaseAdmin();
  const { data: file, error } = await supabase
    .from("files")
    .select("storage_path")
    .eq("item_id", itemId)
    .eq("user_id", session.userId)
    .single();
  if (error || !file) return json({ error: "not_found" }, 404);

  const { data: signed, error: signError } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(file.storage_path, 300);
  if (signError || !signed) return json({ error: "sign_failed" }, 500);

  return json({ url: signed.signedUrl, expiresIn: 300 });
});
