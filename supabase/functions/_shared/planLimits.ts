// Wherever a limit or feature gate is checked, it must consult this
// instead of reading `plans` by profile.plan directly — a purchased
// "Свой тариф" (custom_plan, stored on profiles) fully overrides the
// preset plan's numbers/features when present, exactly the way the Mini
// App's CustomPlanCard already presents it as an alternative to Pro/
// Premium, not an add-on to them.

export interface EffectiveLimits {
  aiCallsLimitPerMonth: number;
  storageLimitBytes: number;
  secretsLimit: number;
  ocrEnabled: boolean;
  summaryEnabled: boolean;
  collectionsCreateEnabled: boolean;
}

interface CustomPlanRow {
  storageGb: number;
  aiCalls: number;
  secrets: number;
  features: string[];
}

// deno-lint-ignore no-explicit-any
export async function getEffectiveLimits(
  supabase: any,
  profile: { plan: string; custom_plan?: CustomPlanRow | null },
): Promise<EffectiveLimits> {
  const custom = profile.custom_plan;
  if (custom) {
    return {
      aiCallsLimitPerMonth: custom.aiCalls,
      storageLimitBytes: Math.round(custom.storageGb * 1024 ** 3),
      secretsLimit: custom.secrets,
      ocrEnabled: custom.features.includes("ocr"),
      summaryEnabled: custom.features.includes("summary"),
      collectionsCreateEnabled: custom.features.includes("collections"),
    };
  }

  const { data: plan } = await supabase
    .from("plans")
    .select("ai_calls_limit_per_month, storage_limit_bytes, secrets_limit")
    .eq("id", profile.plan)
    .single();

  return {
    aiCallsLimitPerMonth: plan?.ai_calls_limit_per_month ?? 0,
    storageLimitBytes: plan?.storage_limit_bytes ?? 0,
    secretsLimit: plan?.secrets_limit ?? 0,
    ocrEnabled: profile.plan !== "free",
    summaryEnabled: profile.plan === "pro_plus",
    collectionsCreateEnabled: profile.plan === "pro_plus",
  };
}
