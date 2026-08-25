import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Users, ChevronRight, Plus } from "lucide-react";
import { Header } from "../components/Header";
import { BottomNav } from "../components/BottomNav";
import { Card, EmptyState, ErrorState, Skeleton, Button } from "../components/ui";
import { ApiError, createCollection, listCollections } from "../lib/api";
import { useAuthStore } from "../state/auth";
import { useToastStore } from "../state/toast";

export function CollectionsScreen() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const push = useToastStore((s) => s.push);
  const profile = useAuthStore((s) => s.profile);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");

  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ["collections"], queryFn: listCollections });

  const create = async () => {
    if (!name.trim()) return;
    try {
      const collection = await createCollection(name.trim());
      push("Подборка создана", "success");
      setName("");
      setCreating(false);
      queryClient.invalidateQueries({ queryKey: ["collections"] });
      navigate(`/library/collections/${collection.id}`);
    } catch (err) {
      const isPremiumGate = err instanceof ApiError && err.status === 402;
      push(isPremiumGate ? "Создание подборок — на тарифе Premium" : "Не удалось создать подборку", "error");
    }
  };

  return (
    <div className="mx-auto min-h-screen max-w-md pb-24">
      <Header title="Подборки" eyebrow="Библиотека" back />
      <main className="space-y-4 px-4 pt-4">
        <p className="text-xs leading-relaxed text-slate-dim">
          Совместные списки — поделитесь ссылкой, и друг сможет вместе с вами пополнять подборку.
        </p>

        {creating ? (
          <Card className="space-y-2 p-3">
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Название подборки"
              className="w-full rounded-md border border-hairline bg-graphite-raised px-3 py-2 text-sm text-bone placeholder:text-slate-dim outline-none focus:border-signal-dim"
            />
            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={() => setCreating(false)}>
                Отмена
              </Button>
              <Button variant="signal" className="flex-1" disabled={!name.trim()} onClick={create}>
                Создать
              </Button>
            </div>
          </Card>
        ) : (
          <Button variant="secondary" className="w-full" onClick={() => setCreating(true)}>
            <Plus size={14} strokeWidth={1.5} />
            Новая подборка
          </Button>
        )}
        {profile?.plan !== "pro_plus" && !creating && (
          <p className="text-center text-[11px] text-slate-dim">Создание подборок — на тарифе Premium. Присоединяться к чужим можно на любом.</p>
        )}

        {isLoading && (
          <Card className="divide-y divide-hairline p-0">
            {[0, 1].map((i) => (
              <div key={i} className="space-y-2 px-4 py-3">
                <Skeleton className="h-3.5 w-1/2" />
                <Skeleton className="h-3 w-1/4" />
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
            <EmptyState icon={<Users size={22} strokeWidth={1.5} />} title="Пока пусто" description="Создайте подборку или присоединитесь к чужой по ссылке." />
          </Card>
        )}
        {!isLoading && !isError && (data?.length ?? 0) > 0 && (
          <Card className="divide-y divide-hairline p-0">
            {data!.map((c) => (
              <button
                key={c.id}
                onClick={() => navigate(`/library/collections/${c.id}`)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-hairline bg-graphite-raised text-signal">
                  <Users size={16} strokeWidth={1.5} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-bone">{c.name}</p>
                  <p className="text-xs text-slate-dim">
                    {c.itemCount ?? 0} записей · {c.myRole === "owner" ? "вы владелец" : "участник"}
                  </p>
                </div>
                <ChevronRight size={15} strokeWidth={1.5} className="shrink-0 text-slate-dim" />
              </button>
            ))}
          </Card>
        )}
      </main>
      <BottomNav />
    </div>
  );
}
