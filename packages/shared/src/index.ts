import { z } from "zod";

const passwordSchema = z.string().min(10).max(128);

export const registerSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(254),
  password: passwordSchema,
});

export const loginSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(128),
});

export const transferSchema = z.object({
  accountNumber: z.string().regex(/^BB\d{10}$/),
  amountMinor: z.string().regex(/^[1-9]\d{0,17}$/),
  memo: z.string().trim().max(140).optional(),
  category: z.enum(["Home", "Food", "Transport", "Family", "Other"]).default("Other"),
});

export const depositSchema = z.object({
  amountMinor: z.string().regex(/^[1-9]\d{0,17}$/),
  memo: z.string().trim().max(140).optional(),
});

export const transactionQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  kind: z.enum(["DEPOSIT", "TRANSFER"]).optional(),
  direction: z.enum(["in", "out"]).optional(),
  sort: z.enum(["newest", "oldest", "amount-high", "amount-low"]).default("newest"),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),
});

export const adminStatusSchema = z.object({
  status: z.enum(["ACTIVE", "SUSPENDED"]),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type TransferInput = z.infer<typeof transferSchema>;
export type DepositInput = z.infer<typeof depositSchema>;
export type TransactionQuery = z.infer<typeof transactionQuerySchema>;

export type UserRole = "MEMBER" | "ADMIN";
export type UserStatus = "ACTIVE" | "SUSPENDED";

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  accountNumber: string;
  balanceMinor: string;
  createdAt: string;
}

export interface TransactionItem {
  id: string;
  kind: "DEPOSIT" | "TRANSFER";
  amountMinor: string;
  direction: "in" | "out";
  memo: string | null;
  category: string | null;
  counterparty: string;
  accountNumber: string | null;
  createdAt: string;
}
