// Pricing for the self-assembled "Свой тариф". Kept client-side for now
// since there's no live checkout to validate against yet (see
// payment-webhook) — once one exists, mirror this formula server-side
// before trusting a price from the client.
//
// Design goal: a custom bundle that matches Pro or Premium resource-for-
// resource must cost noticeably MORE than actually buying Pro/Premium.
// Per-unit rates below are calibrated against the current preset limits
// (Free 1GB/50 calls/5 secrets, Pro 3GB/500/10 for 249₽, Premium
// 7GB/2000/20 for 449₽):
//   - Pro's bundle assembled by hand ≈ 350₽ vs. Pro's real 249₽.
//   - Premium's bundle assembled by hand ≈ 1030₽ vs. Premium's real 449₽ —
//     the bulk discount on the ready-made plans stays clearly worth it.
// The three feature toggles (OCR, article summaries, shared collections)
// mirror the Pro/Premium feature ladder exactly — see FEATURE_TOGGLES.

export const CUSTOM_PLAN_RATES = {
  perGbStorage: 25,
  perAiCall: 0.35,
  perSecretSlot: 6,
  flexibilityFee: 39,
} as const;

export const CUSTOM_PLAN_LIMITS = {
  storageGb: { min: 1, max: 20, step: 1, default: 3 },
  aiCalls: { min: 50, max: 3000, step: 50, default: 300 },
  secrets: { min: 5, max: 40, step: 5, default: 10 },
} as const;

export type CustomFeatureId = "ocr" | "summary" | "collections";

export interface CustomFeatureDef {
  id: CustomFeatureId;
  label: string;
  hint: string;
  priceRub: number;
  /** Which preset tier already includes this for free, for the "included in Premium" nudge. */
  includedFrom: "pro" | "pro_plus";
}

export const CUSTOM_FEATURE_TOGGLES: CustomFeatureDef[] = [
  {
    id: "ocr",
    label: "Распознавание текста на скриншотах",
    hint: "Текст с картинок попадает в поиск (OCR)",
    priceRub: 49,
    includedFrom: "pro",
  },
  {
    id: "summary",
    label: "Пересказ статей за 30 секунд",
    hint: "Короткая выжимка по ссылке одной кнопкой",
    priceRub: 89,
    includedFrom: "pro_plus",
  },
  {
    id: "collections",
    label: "Совместные подборки с друзьями",
    hint: "Создавайте общие списки, друзья дополняют",
    priceRub: 99,
    includedFrom: "pro_plus",
  },
];

export interface CustomPlanSelection {
  storageGb: number;
  aiCalls: number;
  secrets: number;
  features: CustomFeatureId[];
}

export function customPlanPrice(sel: CustomPlanSelection): number {
  const featuresTotal = sel.features.reduce((sum, id) => {
    const def = CUSTOM_FEATURE_TOGGLES.find((f) => f.id === id);
    return sum + (def?.priceRub ?? 0);
  }, 0);
  const raw =
    sel.storageGb * CUSTOM_PLAN_RATES.perGbStorage +
    sel.aiCalls * CUSTOM_PLAN_RATES.perAiCall +
    sel.secrets * CUSTOM_PLAN_RATES.perSecretSlot +
    CUSTOM_PLAN_RATES.flexibilityFee +
    featuresTotal;
  return Math.round(raw / 5) * 5;
}

// Display-only mirror of the server's customPlanPriceStars (same ~1 XTR ≈
// 1.5₽ rate) — the actual charged amount is always recomputed server-side
// in create-stars-invoice from the selection, never trusted from here.
export function customPlanPriceStars(sel: CustomPlanSelection): number {
  return Math.max(1, Math.round(customPlanPrice(sel) / 1.5 / 5) * 5);
}
