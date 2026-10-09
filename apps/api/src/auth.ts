import { createHmac, randomBytes, randomInt } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import bcrypt from "bcryptjs";
import type { PrismaClient } from "@boss-bank/db";
import { HttpError } from "./errors.js";

export const SESSION_COOKIE = "boss_session";
const sessionLifetimeMs = 7 * 24 * 60 * 60 * 1000;

export function hashToken(token: string): string {
  return createHmac("sha256", process.env.SESSION_SECRET ?? "boss-bank-development-session-key").update(token).digest("hex");
}

export async function createSession(db: PrismaClient, userId: string): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await db.session.create({
    data: {
      tokenHash: hashToken(token),
      userId,
      expiresAt: new Date(Date.now() + sessionLifetimeMs),
    },
  });
  return token;
}

export function setSessionCookie(response: Response, token: string): void {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  response.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/api; Max-Age=${sessionLifetimeMs / 1000}${secure}`,
  );
}

export function clearSessionCookie(response: Response): void {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  response.setHeader("Set-Cookie", `${SESSION_COOKIE}=; HttpOnly; SameSite=Strict; Path=/api; Max-Age=0${secure}`);
}

function sessionToken(request: Request): string | undefined {
  const cookieHeader = request.headers.cookie;
  const entry = cookieHeader?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${SESSION_COOKIE}=`));
  return entry?.slice(SESSION_COOKIE.length + 1);
}

export function requireAuth(db: PrismaClient) {
  return async (request: Request, _response: Response, next: NextFunction) => {
    try {
      const token = sessionToken(request);
      if (!token) throw new HttpError(401, "Sign in to continue", "UNAUTHENTICATED");

      const session = await db.session.findUnique({
        where: { tokenHash: hashToken(token) },
        include: { user: { include: { wallet: true } } },
      });
      if (!session || session.expiresAt <= new Date()) {
        if (session) await db.session.delete({ where: { id: session.id } });
        throw new HttpError(401, "Your session has expired", "UNAUTHENTICATED");
      }
      if (session.user.status !== "ACTIVE") {
        throw new HttpError(403, "This account is suspended", "ACCOUNT_SUSPENDED");
      }
      if (!session.user.wallet) throw new HttpError(403, "Wallet unavailable", "WALLET_UNAVAILABLE");

      request.authUser = {
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
        role: session.user.role,
        status: session.user.status,
        walletId: session.user.wallet.id,
        accountNumber: session.user.wallet.accountNumber,
        balanceMinor: session.user.wallet.balanceMinor,
        createdAt: session.user.createdAt,
      };
      request.sessionId = session.id;
      next();
    } catch (error) {
      next(error);
    }
  };
}

export async function registerUser(
  db: PrismaClient,
  input: { name: string; email: string; password: string },
) {
  const email = input.email.trim().toLowerCase(); if (!/^[^ @]+@[^ @]+[.][^ @]{2,}$/.test(email)) throw new HttpError(400, "Enter a valid email address", "INVALID_EMAIL");
  const passwordHash = await bcrypt.hash(input.password, 12);

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const accountNumber = `BB${randomInt(0, 10_000_000_000).toString().padStart(10, "0")}`;
    try {
      return await db.user.create({
        data: {
          name: input.name,
          email,
          passwordHash,
          wallet: { create: { accountNumber } },
        },
        include: { wallet: true },
      });
    } catch (error) {
      if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
        const existing = await db.user.findUnique({ where: { email } });
        if (existing) throw new HttpError(409, "An account with this email already exists", "EMAIL_IN_USE");
        if (attempt < 3) continue;
      }
      throw error;
    }
  }
  throw new HttpError(503, "Could not create an account right now", "ACCOUNT_NUMBER_UNAVAILABLE");
}

export async function authenticateUser(db: PrismaClient, email: string, password: string) {
  const user = await db.user.findUnique({ where: { email: email.toLowerCase() }, include: { wallet: true } });
  const matches = await bcrypt.compare(password, user?.passwordHash ?? "$2b$12$invalidhashinvalidhashinvalidhashinvalidhashinvalidhash");
  if (!user || !matches) throw new HttpError(401, "Email or password is incorrect", "INVALID_CREDENTIALS");
  if (user.status !== "ACTIVE") throw new HttpError(403, "This account is suspended", "ACCOUNT_SUSPENDED");
  if (!user.wallet) throw new HttpError(403, "Wallet unavailable", "WALLET_UNAVAILABLE");
  return user;
}
