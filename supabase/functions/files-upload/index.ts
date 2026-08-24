import { handleOptions, json } from "./_shared/cors.ts";
import { requireSession } from "./_shared/auth.ts";
import { supabaseAdmin } from "./_shared/supabaseAdmin.ts";

const BUCKET = "vault-files";
const MAX_BYTES = 25 * 1024 * 1024; // 25MB — generous for a free-tier MVP

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const session = await requireSession(req);
  if (!session) return json({ error: "unauthorized" }, 401);

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || !(file instanceof File)) return json({ error: "missing_file" }, 400);
  if (file.size > MAX_BYTES) return json({ error: "file_too_large", limit: MAX_BYTES }, 413);

  const supabase = supabaseAdmin();

  const { data: profile } = await supabase
    .from("profiles")
    .select("plan, storage_used_bytes")
    .eq("id", session.userId)
    .single();
  const { data: plan } = await supabase
    .from("plans")
    .select("storage_limit_bytes")
    .eq("id", profile?.plan ?? "free")
    .single();
  if (plan && profile && profile.storage_used_bytes + file.size > plan.storage_limit_bytes) {
    return json({ error: "storage_limit_reached", limit: plan.storage_limit_bytes }, 402);
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${session.userId}/${crypto.randomUUID()}-${safeName}`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type || "application/octet-stream" });
  if (uploadError) return json({ error: uploadError.message }, 500);

  const isImage = (file.type || "").startsWith("image/");
  const { data: item, error: itemError } = await supabase
    .from("items")
    .insert({
      user_id: session.userId,
      type: isImage ? "image" : "file",
      title: file.name,
      status: "inbox",
      ai_meta: { mime_type: file.type, size_bytes: file.size },
    })
    .select("*")
    .single();
  if (itemError) return json({ error: itemError.message }, 500);

  await supabase.from("files").insert({
    user_id: session.userId,
    item_id: item.id,
    storage_path: path,
    mime_type: file.type,
    size_bytes: file.size,
  });

  await supabase
    .from("profiles")
    .update({ storage_used_bytes: (profile?.storage_used_bytes ?? 0) + file.size })
    .eq("id", session.userId);

  return json({ item }, 201);
});
