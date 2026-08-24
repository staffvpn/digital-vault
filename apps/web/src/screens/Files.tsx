import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FolderOpen, Upload } from "lucide-react";
import { Header } from "../components/Header";
import { BottomNav } from "../components/BottomNav";
import { ItemRow } from "../components/ItemRow";
import { ItemActionsSheet } from "../components/ItemActionsSheet";
import { Card, EmptyState, ErrorState, IconButton, Skeleton } from "../components/ui";
import { listItems, uploadFile } from "../lib/api";
import { useAuthStore } from "../state/auth";
import { formatBytes } from "../lib/typeMeta";
import { useToastStore } from "../state/toast";
import type { VaultItem } from "../types";

const FREE_LIMIT_BYTES = 524_288_000; // 500MB, matches the free plan row

export function FilesScreen() {
  const queryClient = useQueryClient();
  const profile = useAuthStore((s) => s.profile);
  const push = useToastStore((s) => s.push);
  const [selected, setSelected] = useState<VaultItem | null>(null);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["items", "files"],
    queryFn: async () => {
      const [files, images] = await Promise.all([listItems({ type: "file" }), listItems({ type: "image" })]);
      return [...files, ...images];
    },
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["items"] });

  const used = profile?.storageUsedBytes ?? 0;
  const limit = FREE_LIMIT_BYTES;
  const pct = Math.min(100, Math.round((used / limit) * 100));

  const onUpload = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      await uploadFile(file);
      push(`Сохранено: ${file.name}`, "success");
      invalidate();
    } catch {
      push("Не удалось загрузить файл", "error");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="mx-auto min-h-screen max-w-md pb-24">
      <Header
        title="Files"
        eyebrow="Library"
        back
        right={
          <IconButton onClick={() => inputRef.current?.click()} aria-label="Загрузить файл" disabled={uploading}>
            <Upload size={15} strokeWidth={1.5} />
          </IconButton>
        }
      />
      <input ref={inputRef} type="file" className="hidden" onChange={(e) => onUpload(e.target.files)} />
      <main className="space-y-4 px-4 pt-4">
        <Card className="space-y-2 p-4">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-medium uppercase tracking-wider text-slate-dim">Storage</p>
            <p className="font-mono text-xs text-slate tabular">
              {formatBytes(used)} / {formatBytes(limit)}
            </p>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-graphite-raised">
            <div
              className="h-full rounded-full bg-signal transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
        </Card>

        {uploading && (
          <Card className="flex items-center gap-3 px-4 py-3">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-graphite-raised">
              <div className="h-full w-1/2 animate-pulse rounded-full bg-signal" />
            </div>
            <span className="font-mono text-[11px] text-slate">UPLOADING</span>
          </Card>
        )}

        {isLoading && (
          <Card className="divide-y divide-hairline p-0">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3">
                <Skeleton className="h-9 w-9" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3.5 w-2/3" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              </div>
            ))}
          </Card>
        )}
        {isError && (
          <Card>
            <ErrorState title="Не удалось загрузить" onRetry={() => refetch()} />
          </Card>
        )}
        {!isLoading && !isError && data?.length === 0 && (
          <Card>
            <EmptyState icon={<FolderOpen size={22} strokeWidth={1.5} />} title="Пока пусто" description="Загрузите файл или перетащите его в Inbox." />
          </Card>
        )}
        {!isLoading && !isError && data && data.length > 0 && (
          <Card className="divide-y divide-hairline p-0">
            {data.map((item) => (
              <ItemRow key={item.id} item={item} onOpen={() => setSelected(item)} />
            ))}
          </Card>
        )}
      </main>
      <ItemActionsSheet item={selected} open={Boolean(selected)} onClose={() => setSelected(null)} onChanged={invalidate} />
      <BottomNav />
    </div>
  );
}
