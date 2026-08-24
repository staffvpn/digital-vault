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

const YOUTUBE_HOSTS = new Set(["youtube.com", "m.youtube.com", "youtu.be"]);

// YouTube's plain server-side HTML fetch is unreliable from EU-region
// servers — Google often serves a cookie-consent interstitial instead of
// the actual video page, which strips out title/thumbnail entirely. The
// public oEmbed endpoint is built for exactly this (link previews) and
// needs no API key or consent handling.
async function fetchYoutubeOembed(targetUrl: string, domain: string): Promise<LinkMeta | null> {
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(targetUrl)}&format=json`,
      { signal: AbortSignal.timeout(6000) },
    );
    if (!res.ok) return null;
    const data = await res.json();
    return {
      title: data.title ?? null,
      description: data.author_name ? `Канал: ${data.author_name}` : null,
      image: data.thumbnail_url ?? null,
      domain,
    };
  } catch {
    return null;
  }
}

// A screenshot of the actual page communicates "what site is this" far
// better than text ever does — but plenty of sites either have no og:image
// or block scraping entirely. mshots is a free, keyless screenshot service
// (used by Jetpack/WordPress.com) that renders any URL on demand and caches
// the result, so it works as a universal fallback with zero setup.
function mshotsFallback(targetUrl: string): string {
  return `https://s.wordpress.com/mshots/v1/${encodeURIComponent(targetUrl)}?w=640`;
}

export async function fetchLinkMeta(targetUrl: string): Promise<LinkMeta> {
  const domain = new URL(targetUrl).hostname.replace(/^www\./, "");
  if (YOUTUBE_HOSTS.has(domain)) {
    const oembed = await fetchYoutubeOembed(targetUrl, domain);
    if (oembed) return oembed;
  }
  try {
    const res = await fetch(targetUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; DigitalVaultBot/1.0)" },
      signal: AbortSignal.timeout(6000),
    });
    const html = await res.text();
    const title = extractMeta(html, "og:title") ?? html.match(/<title>([^<]*)<\/title>/i)?.[1] ?? null;
    const description = extractMeta(html, "og:description") ?? extractMeta(html, "description");
    const rawImage = extractMeta(html, "og:image");
    let image: string | null = null;
    if (rawImage) {
      try {
        image = new URL(rawImage, targetUrl).toString();
      } catch {
        image = null;
      }
    }
    return { title, description, image: image ?? mshotsFallback(targetUrl), domain };
  } catch {
    return { title: null, description: null, image: mshotsFallback(targetUrl), domain };
  }
}
