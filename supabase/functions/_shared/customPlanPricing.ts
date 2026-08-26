// Server-side mirror of apps/web/src/lib/customPlanPricing.ts — a real
// payment must never trust a price computed on the client, so the same
// rates/limits/feature prices are duplicated here and used to both
// validate the selection and recompute the price from scratch.

export const CUSTOM_PLAN_RATES = {
  perGbStorage: 25,
  perAiCall: 0.35,
  perSecretSlot: 6,
  flexibilityFee: 39,
} as const;

export const CUSTOM_PLAN_LIMITS = {
  storageGb: { min: 1, max: 20 },
  aiCalls: { min: 50, max: 3000 },
  secrets: { min: 5, max: 40 },
} as const;

export type CustomFeatureId = "ocr" | "summary" | "collections";

export const CUSTOM_FEATURE_PRICES: Record<CustomFeatureId, number> = {
  ocr: 49,
  summary: 89,
  collections: 99,
};

export interface CustomPlanSelection {
  storageGb: number;
  aiCalls: number;
  secrets: number;
  features: CustomFeatureId[];
}

export function validateCustomSelection(sel: unknown): CustomPlanSelection | null {
  if (!sel || typeof sel !== "object") return null;
  const s = sel as Record<string, unknown>;
  const storageGb = Number(s.storageGb);
  const aiCalls = Number(s.aiCalls);
  const secrets = Number(s.secrets);
  const features = Array.isArray(s.features) ? s.features : [];

  if (!Number.isFinite(storageGb) || storageGb < CUSTOM_PLAN_LIMITS.storageGb.min || storageGb > CUSTOM_PLAN_LIMITS.storageGb.max) return null;
  if (!Number.isFinite(aiCalls) || aiCalls < CUSTOM_PLAN_LIMITS.aiCalls.min || aiCalls > CUSTOM_PLAN_LIMITS.aiCalls.max) return null;
  if (!Number.isFinite(secrets) || secrets < CUSTOM_PLAN_LIMITS.secrets.min || secrets > CUSTOM_PLAN_LIMITS.secrets.max) return null;
  if (!features.every((f) => typeof f === "string" && f in CUSTOM_FEATURE_PRICES)) return null;

  return { storageGb, aiCalls, secrets, features: features as CustomFeatureId[] };
}

export function customPlanPriceRub(sel: CustomPlanSelection): number {
  const featuresTotal = sel.features.reduce((sum, id) => sum + (CUSTOM_FEATURE_PRICES[id] ?? 0), 0);
  const raw =
    sel.storageGb * CUSTOM_PLAN_RATES.perGbStorage +
    sel.aiCalls * CUSTOM_PLAN_RATES.perAiCall +
    sel.secrets * CUSTOM_PLAN_RATES.perSecretSlot +
    CUSTOM_PLAN_RATES.flexibilityFee +
    featuresTotal;
  return Math.round(raw / 5) * 5;
}

// Same ~1 XTR ≈ 1.5₽ rate used for the Pro/Premium Stars prices.
export function customPlanPriceStars(sel: CustomPlanSelection): number {
  return Math.max(1, Math.round(customPlanPriceRub(sel) / 1.5 / 5) * 5);
}
