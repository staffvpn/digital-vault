export type ItemType =
  | "link"
  | "text"
  | "image"
  | "file"
  | "note"
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
  source_url: string | null;
  source_domain: string | null;
  preview_url: string | null;
  ocr_text: string | null;
  ai_meta: Record<string, unknown>;
  status: ItemStatus;
  movie_status: MovieStatus | null;
  confidence: number | null;
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

export interface Profile {
  id: string;
  username: string | null;
  firstName: string | null;
  plan: Plan;
  storageUsedBytes: number;
  aiCallsUsed: number;
  secretsCount: number;
}

export interface PlanInfo {
  id: Plan;
  price_rub: number;
  storage_limit_bytes: number;
  ai_calls_limit_per_month: number;
  secrets_limit: number;
  features: string[];
}

export interface ClassifyResult {
  type: ItemType | "possible_credential" | "unknown";
  category: string | null;
  subcategory?: string | null;
  title: string | null;
  tags: string[];
  confidence: number;
}
