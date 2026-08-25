import { handleOptions, json } from "./_shared/cors.ts";
import { requireSession } from "./_shared/auth.ts";
import { supabaseAdmin } from "./_shared/supabaseAdmin.ts";
import { updatePinnedWidget } from "./_shared/pinnedWidget.ts";

// deno-lint-ignore no-explicit-any
function maybeUpdateWidget(supabase: any, userId: string) {
  // Fire-and-forget — Pro/Premium perk, must never slow down or fail a save.
  // waitUntil keeps it running after the response is sent instead of the
  // isolate tearing down mid-request.
  const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
  if (!botToken) return;
  const task = updatePinnedWidget(supabase, botToken, userId).catch(() => {});
  // deno-lint-ignore no-explicit-any
  (globalThis as any).EdgeRuntime?.waitUntil?.(task);
}

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;

  const session = await requireSession(req);
  if (!session) return json({ error: "unauthorized" }, 401);

  const supabase = supabaseAdmin();
  const url = new URL(req.url);

  if (req.method === "GET") {
    let query = supabase
      .from("items")
      .select("*")
      .eq("user_id", session.userId)
      .order("created_at", { ascending: false });

    const status = url.searchParams.get("status");
    const type = url.searchParams.get("type");
    const category = url.searchParams.get("category");
    const q = url.searchParams.get("q");
    if (status) query = query.eq("status", status);
    if (type) query = query.eq("type", type);
    if (category) query = query.eq("category", category);
    if (q) {
      const like = `%${q}%`;
      query = query.or(
        `title.ilike.${like},description.ilike.${like},body.ilike.${like},ocr_text.ilike.${like},category.ilike.${like},source_domain.ilike.${like}`,
      );
    }

    const { data, error } = await query.limit(200);
    if (error) return json({ error: error.message }, 500);
    return json({ items: data });
  }

  if (req.method === "POST") {
    const body = await req.json().catch(() => null);
    if (!body) return json({ error: "invalid_json" }, 400);
    const { data, error } = await supabase
      .from("items")
      .insert({ ...body, user_id: session.userId })
      .select("*")
      .single();
    if (error) return json({ error: error.message }, 500);
    if (data.status === "saved") maybeUpdateWidget(supabase, session.userId);
    return json({ item: data }, 201);
  }

  if (req.method === "PATCH") {
    const body = await req.json().catch(() => null);
    if (!body?.id) return json({ error: "missing_id" }, 400);
    const { id, ...fields } = body;
    const { data, error } = await supabase
      .from("items")
      .update(fields)
      .eq("id", id)
      .eq("user_id", session.userId)
      .select("*")
      .single();
    if (error) return json({ error: error.message }, 500);
    if (fields.status === "saved") maybeUpdateWidget(supabase, session.userId);
    return json({ item: data });
  }

  if (req.method === "DELETE") {
    const id = url.searchParams.get("id");
    if (!id) return json({ error: "missing_id" }, 400);
    const { error } = await supabase.from("items").delete().eq("id", id).eq("user_id", session.userId);
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true });
  }

  return json({ error: "method_not_allowed" }, 405);
});
