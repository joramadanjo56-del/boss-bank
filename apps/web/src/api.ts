import type { PublicUser, TransactionItem } from "@boss-bank/shared";

const baseUrl = import.meta.env.VITE_API_URL ?? "/api";

export class ApiError extends Error {
  constructor(message: string, public readonly status: number, public readonly code?: string) {
    super(message);
    this.name = "ApiError";
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });
  if (response.status === 204) return undefined as T;
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(body.error ?? "Something went wrong", response.status, body.code);
  return body as T;
}

export interface DashboardData {
  balanceMinor: string;
  moneyInMinor: string;
  moneyOutMinor: string;
  chart: Array<{ label: string; inMinor: string; outMinor: string }>;
  categories: Array<{ name: string; amountMinor: string }>;
  recent: TransactionItem[];
}

export interface TransactionPage {
  transactions: TransactionItem[];
  nextCursor: string | null;
}

export interface WalletAdminUser extends PublicUser {}