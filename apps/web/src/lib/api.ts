import { supabase } from "./supabase";
import { useAuthStore } from "../state/auth";
import type { ClassifyResult, PlanInfo, SecretSummary, VaultItem } from "../types";

export class ApiError extends Error {
  status?: number;
  code?: string;
  constructor(message: string, status?: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function call<T>(
  fn: string,
  opts: { method?: string; body?: unknown; query?: Record<string, string | undefined> } = {},
): Promise<T> {
  const token = useAuthStore.getState().sessionToken;
  const url = new URL(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${fn}`);
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      if (v !== undefined) url.searchParams.set(k, v);
    }
  }
  const res = await fetch(url.toString(), {
    method: opts.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(data.error ?? `request_failed_${res.status}`, res.status, data.error);
  }
  return data as T;
}

export async function authenticate(initData: string) {
  return call<{ sessionToken: string; expiresIn: number; profile: import("../types").Profile }>(
    "auth-telegram",
    { method: "POST", body: { initData } },
  );
}

export async function listItems(params: { status?: string; type?: string; category?: string; q?: string }) {
  const { items } = await call<{ items: VaultItem[] }>("items-crud", { query: params });
  return items;
}

export async function createItem(fields: Partial<VaultItem>) {
  const { item } = await call<{ item: VaultItem }>("items-crud", { method: "POST", body: fields });
  return item;
}

export async function updateItem(id: string, fields: Partial<VaultItem>) {
  const { item } = await call<{ item: VaultItem }>("items-crud", { method: "PATCH", body: { id, ...fields } });
  return item;
}

export async function deleteItem(id: string) {
  await call("items-crud", { method: "DELETE", query: { id } });
}

export async function listSecrets() {
  const { secrets } = await call<{ secrets: SecretSummary[] }>("secrets-crud", {});
  return secrets;
}

export async function createSecret(fields: { name: string; username?: string; password: string; category?: string; tags?: string[] }) {
  const { secret } = await call<{ secret: SecretSummary }>("secrets-crud", { method: "POST", body: fields });
  return secret;
}

export async function revealSecret(id: string) {
  const { password } = await call<{ password: string }>("secrets-crud", {
    method: "POST",
    body: { action: "reveal", id },
  });
  return password;
}

export async function updateSecret(id: string, fields: Record<string, unknown>) {
  const { secret } = await call<{ secret: SecretSummary }>("secrets-crud", { method: "PATCH", body: { id, ...fields } });
  return secret;
}

export async function deleteSecret(id: string) {
  await call("secrets-crud", { method: "DELETE", query: { id } });
}

export async function classifyContent(payload: { kind: "url" | "text" | "image"; content: string; mimeType?: string }) {
  return call<{ result: ClassifyResult; source: string; linkMeta?: unknown; existingItem?: VaultItem }>("classify-item", {
    method: "POST",
    body: payload,
  });
}

export async function summarizeLink(itemId: string) {
  return call<{ summary: string; cached: boolean }>("summarize-link", { method: "POST", body: { item_id: itemId } });
}

export async function listCollections() {
  const { collections } = await call<{ collections: import("../types").Collection[] }>("collections");
  return collections;
}

export async function getCollection(id: string) {
  return call<{ collection: import("../types").Collection; items: VaultItem[]; memberCount: number; myRole: string }>(
    "collections",
    { query: { id } },
  );
}

export async function createCollection(name: string) {
  const { collection } = await call<{ collection: import("../types").Collection }>("collections", {
    method: "POST",
    body: { action: "create", name },
  });
  return collection;
}

export async function addItemToCollection(collectionId: string, itemId: string) {
  await call("collections", { method: "POST", body: { action: "add_item", collection_id: collectionId, item_id: itemId } });
}

export async function removeItemFromCollection(collectionId: string, itemId: string) {
  await call("collections", { method: "POST", body: { action: "remove_item", collection_id: collectionId, item_id: itemId } });
}

export async function deleteCollection(id: string) {
  await call("collections", { method: "DELETE", query: { id } });
}

export async function fetchLinkMetadata(targetUrl: string) {
  return call<{ meta: { title: string | null; description: string | null; image: string | null; domain: string | null } }>(
    "link-metadata",
    { query: { url: targetUrl } },
  );
}

export async function uploadFile(file: File): Promise<VaultItem> {
  const token = useAuthStore.getState().sessionToken;
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/files-upload`, {
    method: "POST",
    headers: {
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: form,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error ?? `upload_failed_${res.status}`, res.status);
  return data.item as VaultItem;
}

export async function transcribeAudio(blob: Blob, filename = "voice.webm"): Promise<string> {
  const token = useAuthStore.getState().sessionToken;
  const form = new FormData();
  form.append("audio", blob, filename);
  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/transcribe-audio`, {
    method: "POST",
    headers: {
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: form,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error ?? `transcribe_failed_${res.status}`, res.status, data.error);
  return data.text as string;
}

export async function getFileUrl(itemId: string) {
  const { url } = await call<{ url: string }>("files-url", { query: { item_id: itemId } });
  return url;
}

export async function listPlans() {
  const { data, error } = await supabase.from("plans").select("*").order("price_rub", { ascending: true });
  if (error) throw new ApiError(error.message);
  return data as PlanInfo[];
}

export async function getReferralInfo() {
  return call<import("../types").ReferralInfo>("referrals");
}

export async function createStarsInvoice(
  target: { plan: "pro" | "pro_plus" } | { custom: import("./customPlanPricing").CustomPlanSelection },
) {
  return call<{ invoiceLink: string; paymentId: string; stars: number }>("create-stars-invoice", {
    method: "POST",
    body: target,
  });
}
