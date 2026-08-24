import { handleOptions, json } from "./_shared/cors.ts";
import { requireSession } from "./_shared/auth.ts";
import { fetchLinkMeta } from "./_shared/linkMeta.ts";

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;
  const session = await requireSession(req);
  if (!session) return json({ error: "unauthorized" }, 401);

  const url = new URL(req.url);
  const target = url.searchParams.get("url");
  if (!target) return json({ error: "missing_url" }, 400);
  try {
    new URL(target);
  } catch {
    return json({ error: "invalid_url" }, 400);
  }
  const meta = await fetchLinkMeta(target);
  return json({ meta });
});
