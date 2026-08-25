// Pricing for the self-assembled "Свой тариф". Kept client-side for now
// since there's no live checkout to validate against yet (see
// payment-webhook) — once one exists, mirror this formula server-side
// before trusting a price from the client.
//
// Design goal: a custom bundle that matches Pro or Premium resource-for-
// resource must cost noticeably MORE than actually buying Pro/Premium.
// Per-unit rates below are calibrated so that:
//   - Pro's bundle (5GB / 500 calls / 25 secrets) assembled by hand ≈ 370₽
//     vs. Pro's real price of 249₽.
//   - Premium's bundle (20GB / 2000 calls / 75 secrets) assembled by hand
//     ≈ 1250₽ vs. Premium's real price of 449₽ — the bulk discount on the
//     ready-made plans stays clearly worth it.
// A lopsided pick (e.g. lots of storage, few AI calls) still lands in a
// sensible, distinct price range instead of quietly undercutting either
// preset — see apps/web/src/screens/Info.tsx for the same explanation
// written for users.

export const CUSTOM_PLAN_RATES = {
  perGbStorage: 12,
  perAiCall: 0.35,
  perSecretSlot: 3.5,
  flexibilityFee: 49,
} as const;

export const CUSTOM_PLAN_LIMITS = {
  storageGb: { min: 1, max: 50, step: 1, default: 5 },
  aiCalls: { min: 50, max: 3000, step: 50, default: 300 },
  secrets: { min: 5, max: 150, step: 5, default: 15 },
} as const;

export interface CustomPlanSelection {
  storageGb: number;
  aiCalls: number;
  secrets: number;
}

export function customPlanPrice(sel: CustomPlanSelection): number {
  const raw =
    sel.storageGb * CUSTOM_PLAN_RATES.perGbStorage +
    sel.aiCalls * CUSTOM_PLAN_RATES.perAiCall +
    sel.secrets * CUSTOM_PLAN_RATES.perSecretSlot +
    CUSTOM_PLAN_RATES.flexibilityFee;
  return Math.round(raw / 5) * 5;
}
