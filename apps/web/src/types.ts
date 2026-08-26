export type ItemType =
  | "link"
  | "text"
  | "image"
  | "file"
  | "note"
  | "reminder"
  | "movie"
  | "series"
  | "service"
  | "bookmark"
  | "design_reference";

export type ItemStatus = "inbox" | "saved";
export type MovieStatus = "watch_later" | "watching" | "watched";
export type Plan = "free" | "pro" | "pro_plus";

export interface VaultItem {
  id: string;
  user_id: string;
  type: ItemType;
  category: string | null;
  subcategory: string | null;
  tags: string[];
  title: string | null;
  description: string | null;
  body: string | null;
  source_url: string | null;
  source_domain: string | null;
  preview_url: string | null;
  ocr_text: string | null;
  ai_meta: Record<string, unknown>;
  status: ItemStatus;
  movie_status: MovieStatus | null;
  confidence: number | null;
  // Reminder scheduling — only set when type === "reminder".
  remind_at: string | null;
  remind_has_time: boolean;
  remind_notify_1: string | null;
  remind_notify_2: string | null;
  remind_notified_stage1: boolean;
  remind_notified_stage2: boolean;
  reminder_done: boolean;
  summary: string | null;
  created_at: string;
  updated_at: string;
}

export interface Collection {
  id: string;
  owner_id: string;
  name: string;
  share_code: string;
  itemCount?: number;
  myRole?: "owner" | "member";
  created_at: string;
  updated_at: string;
}

export interface SecretSummary {
  id: string;
  name: string;
  username: string | null;
  category: string | null;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export interface CustomPlanPurchase {
  storageGb: number;
  aiCalls: number;
  secrets: number;
  features: string[];
}

export interface Profile {
  id: string;
  username: string | null;
  firstName: string | null;
  plan: Plan;
  storageUsedBytes: number;
  aiCallsUsed: number;
  secretsCount: number;
  secretsBonus: number;
  referralCode: string;
  hasReferralDiscount: boolean;
  customPlan: CustomPlanPurchase | null;
}

export interface PlanInfo {
  id: Plan;
  price_rub: number;
  price_stars: number;
  storage_limit_bytes: number;
  ai_calls_limit_per_month: number;
  secrets_limit: number;
  features: string[];
}

export interface ReferralStats {
  registered: number;
  paid: number;
  qualified: number;
  rewarded: number;
  blocked: number;
  refunded: number;
}

export type ReferralUserStatus =
  | "registered"
  | "payment_pending"
  | "paid"
  | "qualified"
  | "rewarded"
  | "refunded"
  | "blocked";

export interface ReferredUser {
  name: string;
  status: ReferralUserStatus;
  createdAt: string;
  rewardAmount: number;
  activated: boolean;
  activationRewardAmount: number;
}

export interface ReferralInfo {
  code: string;
  bonusSecrets: number;
  rewardPerReferral: { pro: number; pro_plus: number };
  activationReward: number;
  maxBonusSecrets: number;
  stats: ReferralStats;
  referredUsers: ReferredUser[];
}

export interface ClassifyResult {
  type: ItemType | "possible_credential" | "unknown" | "duplicate";
  category: string | null;
  subcategory?: string | null;
  title: string | null;
  description?: string | null;
  tags: string[];
  confidence: number;
  remind_at?: string | null;
  remind_has_time?: boolean;
  remind_notify_1?: string | null;
  remind_notify_2?: string | null;
  ocr_text?: string | null;
}
