import { getFileUrl } from "./api";
import { openExternalLink } from "./telegram";
import type { VaultItem } from "../types";

// Items are either "link-like" (source_url points somewhere external — a
// bookmark, video, design reference…), "image-like" (viewed in-app via the
// lightbox — see state/lightbox.ts, callers check item.type === "image"
// themselves before reaching here), or "file-like" (an uploaded file whose
// bytes live in private Storage, opened externally since there's no generic
// in-app preview for arbitrary file types).
export function isOpenable(item: Pick<VaultItem, "type" | "source_url">): boolean {
  return Boolean(item.source_url) || item.type === "image" || item.type === "file";
}

export async function openItemContent(item: Pick<VaultItem, "id" | "type" | "source_url">): Promise<void> {
  if (item.source_url) {
    openExternalLink(item.source_url);
    return;
  }
  if (item.type === "file") {
    const url = await getFileUrl(item.id);
    openExternalLink(url);
    return;
  }
}
