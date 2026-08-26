import { handleOptions, json } from "./_shared/cors.ts";
import { requireSession } from "./_shared/auth.ts";
import { supabaseAdmin } from "./_shared/supabaseAdmin.ts";
import { encryptSecret, decryptSecret } from "./_shared/crypto.ts";
import { getEffectiveLimits } from "./_shared/planLimits.ts";

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;

  const session = await requireSession(req);
  if (!session) return json({ error: "unauthorized" }, 401);

  const vaultKey = Deno.env.get("VAULT_ENCRYPTION_KEY");
  if (!vaultKey) return json({ error: "server_not_configured" }, 500);

  const supabase = supabaseAdmin();
  const url = new URL(req.url);

  if (req.method === "GET") {
    // Secrets are NEVER decrypted for a list response.
    const { data, error } = await supabase
      .from("secrets")
      .select("id, name, username, category, tags, created_at, updated_at")
      .eq("user_id", session.userId)
      .order("created_at", { ascending: false });
    if (error) return json({ error: error.message }, 500);
    return json({ secrets: data });
  }

  if (req.method === "POST") {
    const body = await req.json().catch(() => null);
    if (!body) return json({ error: "invalid_json" }, 400);

    if (body.action === "reveal") {
      if (!body.id) return json({ error: "missing_id" }, 400);
      const { data, error } = await supabase
        .from("secrets")
        .select("password_encrypted")
        .eq("id", body.id)
        .eq("user_id", session.userId)
        .single();
      if (error || !data) return json({ error: "not_found" }, 404);
      const password = await decryptSecret(data.password_encrypted, vaultKey);
      return json({ password });
    }

    if (!body.name || !body.password) return json({ error: "missing_fields" }, 400);

    const { data: profile } = await supabase
      .from("profiles")
      .select("plan, custom_plan, secrets_count, secrets_bonus")
      .eq("id", session.userId)
      .single();
    if (profile) {
      const limits = await getEffectiveLimits(supabase, profile);
      // Referral bonuses add Vault slots on top of the plan's base limit,
      // custom or preset alike.
      const effectiveLimit = limits.secretsLimit + (profile.secrets_bonus ?? 0);
      if (profile.secrets_count >= effectiveLimit) {
        return json({ error: "secrets_limit_reached", limit: effectiveLimit }, 402);
      }
    }

    const encrypted = await encryptSecret(body.password, vaultKey);
    const { data, error } = await supabase
      .from("secrets")
      .insert({
        user_id: session.userId,
        name: body.name,
        username: body.username ?? null,
        password_encrypted: encrypted,
        category: body.category ?? null,
        tags: body.tags ?? [],
      })
      .select("id, name, username, category, tags, created_at")
      .single();
    if (error) return json({ error: error.message }, 500);

    await supabase
      .from("profiles")
      .update({ secrets_count: (profile?.secrets_count ?? 0) + 1 })
      .eq("id", session.userId);

    return json({ secret: data }, 201);
  }

  if (req.method === "PATCH") {
    const body = await req.json().catch(() => null);
    if (!body?.id) return json({ error: "missing_id" }, 400);
    const { id, password, ...fields } = body;
    const updates: Record<string, unknown> = { ...fields };
    if (password) updates.password_encrypted = await encryptSecret(password, vaultKey);
    const { data, error } = await supabase
      .from("secrets")
      .update(updates)
      .eq("id", id)
      .eq("user_id", session.userId)
      .select("id, name, username, category, tags, updated_at")
      .single();
    if (error) return json({ error: error.message }, 500);
    return json({ secret: data });
  }

  if (req.method === "DELETE") {
    const id = url.searchParams.get("id");
    if (!id) return json({ error: "missing_id" }, 400);
    const { error } = await supabase.from("secrets").delete().eq("id", id).eq("user_id", session.userId);
    if (error) return json({ error: error.message }, 500);
    const { data: profile } = await supabase
      .from("profiles")
      .select("secrets_count")
      .eq("id", session.userId)
      .single();
    if (profile) {
      await supabase
        .from("profiles")
        .update({ secrets_count: Math.max(0, profile.secrets_count - 1) })
        .eq("id", session.userId);
    }
    return json({ ok: true });
  }

  return json({ error: "method_not_allowed" }, 405);
});
