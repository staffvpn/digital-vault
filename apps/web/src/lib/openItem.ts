import { getFileUrl } from "./api";
import { openExternalLink } from "./telegram";
import type { VaultItem } from "../types";

// Items are either "link-like" (source_url points somewhere external — a
// bookmark, video, design reference…) or "file-like" (an uploaded image/file
// whose bytes live in private Storage, with no source_url at all). Both
// should open the same way on tap; only where the URL comes from differs.
export function isOpenable(item: Pick<VaultItem, "type" | "source_url">): boolean {
  return Boolean(item.source_url) || item.type === "image" || item.type === "file";
}

export async function openItemContent(item: Pick<VaultItem, "id" | "type" | "source_url">): Promise<void> {
  if (item.source_url) {
    openExternalLink(item.source_url);
    return;
  }
  if (item.type === "image" || item.type === "file") {
    const url = await getFileUrl(item.id);
    openExternalLink(url);
    return;
  }
}
