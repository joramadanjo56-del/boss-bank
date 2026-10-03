import type { UserRole, UserStatus } from "@boss-bank/shared";

export interface AuthenticatedUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  walletId: string;
  accountNumber: string;
  balanceMinor: bigint;
  createdAt: Date;
}

declare global {
  namespace Express {
    interface Request {
      authUser?: AuthenticatedUser;
      sessionId?: string;
    }
  }
}