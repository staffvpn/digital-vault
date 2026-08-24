export interface LinkMeta {
  title: string | null;
  description: string | null;
  image: string | null;
  domain: string | null;
}

function extractMeta(html: string, prop: string): string | null {
  const patterns = [
    new RegExp(`<meta[^>]+property=["']${prop}["'][^>]+content=["']([^"']*)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+property=["']${prop}["']`, "i"),
    new RegExp(`<meta[^>]+name=["']${prop}["'][^>]+content=["']([^"']*)["']`, "i"),
  ];
  for (const re of patterns) {
    const match = html.match(re);
    if (match) return match[1];
  }
  return null;
}

export async function fetchLinkMeta(targetUrl: string): Promise<LinkMeta> {
  const domain = new URL(targetUrl).hostname.replace(/^www\./, "");
  try {
    const res = await fetch(targetUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; DigitalVaultBot/1.0)" },
      signal: AbortSignal.timeout(6000),
    });
    const html = await res.text();
    const title = extractMeta(html, "og:title") ?? html.match(/<title>([^<]*)<\/title>/i)?.[1] ?? null;
    const description = extractMeta(html, "og:description") ?? extractMeta(html, "description");
    const image = extractMeta(html, "og:image");
    return { title, description, image, domain };
  } catch {
    return { title: null, description: null, image: null, domain };
  }
}
