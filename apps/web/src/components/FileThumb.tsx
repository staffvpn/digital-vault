import { useQuery } from "@tanstack/react-query";
import { getFileUrl } from "../lib/api";
import { typeMeta } from "../lib/typeMeta";
import { Skeleton } from "./ui";
import type { VaultItem } from "../types";

// Actual image bytes live in private Storage — the item row only has an id,
// so each thumbnail resolves its own short-lived signed URL on demand.
export function FileThumb({ item }: { item: VaultItem }) {
  const meta = typeMeta(item.type);
  const Icon = meta.icon;
  const { data: url, isLoading } = useQuery({
    queryKey: ["file-url", item.id],
    queryFn: () => getFileUrl(item.id),
    staleTime: 4 * 60_000,
  });

  if (isLoading) return <Skeleton className="h-full w-full" />;
  if (!url) return <Icon size={26} strokeWidth={1.2} className="text-slate-dim" />;
  return <img src={url} alt="" className="h-full w-full object-cover" loading="lazy" />;
}
