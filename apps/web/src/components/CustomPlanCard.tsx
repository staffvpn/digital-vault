import { useMemo, useState } from "react";
import { Sparkles } from "lucide-react";
import { Button, Card } from "./ui";
import { PLAN_TITLES, rub } from "./PlanList";
import { CUSTOM_PLAN_LIMITS, customPlanPrice, type CustomPlanSelection } from "../lib/customPlanPricing";
import type { PlanInfo } from "../types";

function bytesToGb(bytes: number): number {
  return bytes / 1024 ** 3;
}

export function CustomPlanCard({
  plans,
  onCheckout,
}: {
  plans?: PlanInfo[];
  onCheckout: (price: number, selection: CustomPlanSelection) => void;
}) {
  const [sel, setSel] = useState<CustomPlanSelection>({
    storageGb: CUSTOM_PLAN_LIMITS.storageGb.default,
    aiCalls: CUSTOM_PLAN_LIMITS.aiCalls.default,
    secrets: CUSTOM_PLAN_LIMITS.secrets.default,
  });

  const price = useMemo(() => customPlanPrice(sel), [sel]);

  // If a ready-made plan already covers everything the sliders ask for,
  // and does it for less, say so — the custom tier should stay honest
  // about when a preset is simply the better deal.
  const betterPreset = useMemo(() => {
    const candidates = (plans ?? []).filter(
      (p) =>
        p.id !== "free" &&
        bytesToGb(p.storage_limit_bytes) >= sel.storageGb &&
        p.ai_calls_limit_per_month >= sel.aiCalls &&
        p.secrets_limit >= sel.secrets &&
        p.price_rub < price,
    );
    candidates.sort((a, b) => a.price_rub - b.price_rub);
    return candidates[0];
  }, [plans, sel, price]);

  return (
    <Card className="space-y-5 p-4">
      <div className="flex items-center gap-2.5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-hairline bg-graphite-raised text-signal">
          <Sparkles size={15} strokeWidth={1.5} />
        </div>
        <div>
          <p className="text-sm font-semibold text-bone">Свой тариф</p>
          <p className="text-xs text-slate-dim">Соберите ресурсы под себя</p>
        </div>
      </div>

      <div className="space-y-4">
        <SliderRow
          label="AI-сохранений в месяц"
          value={sel.aiCalls}
          config={CUSTOM_PLAN_LIMITS.aiCalls}
          onChange={(v) => setSel((s) => ({ ...s, aiCalls: v }))}
          format={(v) => `${v}`}
        />
        <SliderRow
          label="Хранилище"
          value={sel.storageGb}
          config={CUSTOM_PLAN_LIMITS.storageGb}
          onChange={(v) => setSel((s) => ({ ...s, storageGb: v }))}
          format={(v) => `${v} ГБ`}
        />
        <SliderRow
          label="Мест в Сейфе"
          value={sel.secrets}
          config={CUSTOM_PLAN_LIMITS.secrets}
          onChange={(v) => setSel((s) => ({ ...s, secrets: v }))}
          format={(v) => `${v}`}
        />
      </div>

      <div className="flex items-end justify-between border-t border-hairline pt-4">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wider text-slate-dim">Цена</p>
          <p className="font-mono text-3xl font-semibold text-bone tabular">
            {price.toLocaleString("ru-RU")}
            <span className="ml-1 text-base font-normal text-slate">₽/мес</span>
          </p>
        </div>
        <Button variant="signal" onClick={() => onCheckout(price, sel)}>
          Оформить
        </Button>
      </div>

      {betterPreset && (
        <p className="rounded-md border border-signal-dim/40 bg-signal/5 px-3 py-2 text-xs leading-relaxed text-slate">
          <span className="font-medium text-bone">{PLAN_TITLES[betterPreset.id]}</span> уже включает больше этого за{" "}
          {rub(betterPreset.price_rub)} — выгоднее готового пакета.
        </p>
      )}
    </Card>
  );
}

function SliderRow({
  label,
  value,
  config,
  onChange,
  format,
}: {
  label: string;
  value: number;
  config: { min: number; max: number; step: number };
  onChange: (v: number) => void;
  format: (v: number) => string;
}) {
  const pct = ((value - config.min) / (config.max - config.min)) * 100;
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <span className="text-xs text-slate">{label}</span>
        <span className="font-mono text-lg font-semibold text-bone tabular">{format(value)}</span>
      </div>
      <input
        type="range"
        className="slider-signal"
        min={config.min}
        max={config.max}
        step={config.step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{
          background: `linear-gradient(to right, var(--color-signal) ${pct}%, var(--color-hairline-strong) ${pct}%)`,
        }}
      />
    </div>
  );
}
