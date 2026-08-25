import { handleOptions, json } from "./_shared/cors.ts";
import { requireSession } from "./_shared/auth.ts";
import { supabaseAdmin } from "./_shared/supabaseAdmin.ts";

// Shared collections — creating one is Premium (it's the flagship
// collaboration perk), but joining/viewing one someone else shared with you
// is free for anyone: the invite itself is the point, gating that away
// would kill the whole viral loop. Joining happens via auth-telegram's
// start_param handling (fn_join_collection), not through this function —
// this is just CRUD for members.
Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;

  const session = await requireSession(req);
  if (!session) return json({ error: "unauthorized" }, 401);

  const supabase = supabaseAdmin();
  const url = new URL(req.url);

  if (req.method === "GET") {
    const id = url.searchParams.get("id");

    if (id) {
      const { data: membership } = await supabase
        .from("collection_members")
        .select("role")
        .eq("collection_id", id)
        .eq("user_id", session.userId)
        .maybeSingle();
      if (!membership) return json({ error: "not_found" }, 404);

      const { data: collection } = await supabase.from("collections").select("*").eq("id", id).single();
      const { data: itemLinks } = await supabase
        .from("collection_items")
        .select("item_id, added_at")
        .eq("collection_id", id)
        .order("added_at", { ascending: false });
      const itemIds = (itemLinks ?? []).map((l) => l.item_id);
      const { data: items } = itemIds.length
        ? await supabase.from("items").select("*").in("id", itemIds)
        : { data: [] };
      const { count: memberCount } = await supabase
        .from("collection_members")
        .select("*", { count: "exact", head: true })
        .eq("collection_id", id);

      return json({ collection, items: items ?? [], memberCount: memberCount ?? 1, myRole: membership.role });
    }

    const { data: memberships } = await supabase
      .from("collection_members")
      .select("collection_id, role")
      .eq("user_id", session.userId);
    const ids = (memberships ?? []).map((m) => m.collection_id);
    if (!ids.length) return json({ collections: [] });

    const { data: collections } = await supabase.from("collections").select("*").in("id", ids);
    const withCounts = await Promise.all(
      (collections ?? []).map(async (c) => {
        const { count } = await supabase
          .from("collection_items")
          .select("*", { count: "exact", head: true })
          .eq("collection_id", c.id);
        const role = memberships?.find((m) => m.collection_id === c.id)?.role ?? "member";
        return { ...c, itemCount: count ?? 0, myRole: role };
      }),
    );
    return json({ collections: withCounts });
  }

  if (req.method === "POST") {
    const body = await req.json().catch(() => null);
    if (!body?.action) return json({ error: "missing_action" }, 400);

    if (body.action === "create") {
      const { data: profile } = await supabase.from("profiles").select("plan").eq("id", session.userId).single();
      if (profile?.plan !== "pro_plus") return json({ error: "premium_required" }, 402);
      if (!body.name?.trim()) return json({ error: "missing_name" }, 400);

      const { data: collection, error } = await supabase
        .from("collections")
        .insert({ owner_id: session.userId, name: body.name.trim() })
        .select("*")
        .single();
      if (error) return json({ error: error.message }, 500);
      await supabase.from("collection_members").insert({ collection_id: collection.id, user_id: session.userId, role: "owner" });
      return json({ collection }, 201);
    }

    if (body.action === "add_item") {
      if (!body.collection_id || !body.item_id) return json({ error: "missing_fields" }, 400);
      const { data: membership } = await supabase
        .from("collection_members")
        .select("role")
        .eq("collection_id", body.collection_id)
        .eq("user_id", session.userId)
        .maybeSingle();
      if (!membership) return json({ error: "not_a_member" }, 403);
      const { data: item } = await supabase.from("items").select("id").eq("id", body.item_id).eq("user_id", session.userId).maybeSingle();
      if (!item) return json({ error: "not_found" }, 404);

      await supabase
        .from("collection_items")
        .upsert({ collection_id: body.collection_id, item_id: body.item_id, added_by: session.userId }, { onConflict: "collection_id,item_id" });
      return json({ ok: true });
    }

    if (body.action === "remove_item") {
      if (!body.collection_id || !body.item_id) return json({ error: "missing_fields" }, 400);
      const { data: membership } = await supabase
        .from("collection_members")
        .select("role")
        .eq("collection_id", body.collection_id)
        .eq("user_id", session.userId)
        .maybeSingle();
      if (!membership) return json({ error: "not_a_member" }, 403);

      await supabase.from("collection_items").delete().eq("collection_id", body.collection_id).eq("item_id", body.item_id);
      return json({ ok: true });
    }

    return json({ error: "unknown_action" }, 400);
  }

  if (req.method === "DELETE") {
    const id = url.searchParams.get("id");
    if (!id) return json({ error: "missing_id" }, 400);
    const { data: collection } = await supabase.from("collections").select("owner_id").eq("id", id).single();
    if (!collection || collection.owner_id !== session.userId) return json({ error: "not_found" }, 404);
    await supabase.from("collections").delete().eq("id", id);
    return json({ ok: true });
  }

  return json({ error: "method_not_allowed" }, 405);
});
