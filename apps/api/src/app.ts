import express, { type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { Prisma, type PrismaClient } from "@boss-bank/db";
import {
  adminStatusSchema,
  depositSchema,
  loginSchema,
  registerSchema,
  transactionQuerySchema,
  transferSchema,
} from "@boss-bank/shared";
import { authenticateUser, clearSessionCookie, createSession, hashToken, registerUser, requireAuth, setSessionCookie, SESSION_COOKIE } from "./auth.js";
import { HttpError } from "./errors.js";
import { createDevelopmentDeposit, createTransfer } from "./money.js";
import type { AuthenticatedUser } from "./types.js";

interface AppOptions {
  webOrigin?: string;
  nodeEnv?: string;
  allowDevelopmentDeposits?: boolean;
}

function publicUser(user: { id: string; name: string; email: string; role: string; status: string; createdAt: Date; wallet?: { accountNumber: string; balanceMinor: bigint } | null }) {
  if (!user.wallet) throw new HttpError(403, "Wallet unavailable", "WALLET_UNAVAILABLE");
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    status: user.status,
    accountNumber: user.wallet.accountNumber,
    balanceMinor: user.wallet.balanceMinor.toString(),
    createdAt: user.createdAt.toISOString(),
  };
}

function transactionItem(transaction: {
  id: string;
  kind: "DEPOSIT" | "TRANSFER" | "ADJUSTMENT";
  amountMinor: bigint;
  memo: string | null;
  category: string | null;
  createdAt: Date;
  senderWallet?: { accountNumber: string; user: { name: string } } | null;
  recipientWallet?: { accountNumber: string; user: { name: string } } | null;
}, walletId: string) {
  const outgoing = transaction.senderWallet != null;
  const counterpartyWallet = outgoing ? transaction.recipientWallet : transaction.senderWallet;
  return {
    id: transaction.id,
    kind: transaction.kind,
    amountMinor: transaction.amountMinor.toString(),
    direction: outgoing ? "out" : "in",
    memo: transaction.memo,
    category: transaction.category,
    counterparty: counterpartyWallet?.user.name ?? "Development deposit",
    accountNumber: counterpartyWallet?.accountNumber ?? null,
    createdAt: transaction.createdAt.toISOString(),
    walletId,
  };
}

function asyncRoute(handler: (request: Request, response: Response, next: NextFunction) => Promise<unknown>) {
  return (request: Request, response: Response, next: NextFunction) => {
    void handler(request, response, next).catch(next);
  };
}

function requireAdmin(request: Request, _response: Response, next: NextFunction) {
  if (request.authUser?.role !== "ADMIN") return next(new HttpError(403, "Administrator access required", "FORBIDDEN"));
  next();
}

function accountOf(user: AuthenticatedUser) {
  return user;
}

export function createApp(db: PrismaClient, options: AppOptions = {}) {
  const webOrigin = options.webOrigin ?? process.env.WEB_ORIGIN ?? "http://localhost:5173";
  const nodeEnv = options.nodeEnv ?? process.env.NODE_ENV ?? "development";
  const depositsEnabled = options.allowDevelopmentDeposits ?? nodeEnv === "development";
  const app = express();

  app.disable("x-powered-by");
  app.use(helmet());
  app.use(cors({ origin: webOrigin, credentials: true, methods: ["GET", "POST", "PATCH", "OPTIONS"], allowedHeaders: ["Content-Type"] }));
  app.use(express.json({ limit: "16kb" }));
  app.use((request, _response, next) => {
    if (["POST", "PATCH", "PUT", "DELETE"].includes(request.method) && request.get("origin") !== webOrigin) {
      return next(new HttpError(403, "Request origin is not allowed", "ORIGIN_NOT_ALLOWED"));
    }
    next();
  });

  const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: "draft-7", legacyHeaders: false });
  const authenticate = requireAuth(db);
  const api = express.Router();

  api.get("/health", (_request, response) => response.json({ status: "ok" }));

  api.post("/auth/register", authLimiter, asyncRoute(async (request, response) => {
    const input = registerSchema.parse(request.body);
    const user = await registerUser(db, input);
    const token = await createSession(db, user.id);
    await db.auditLog.create({ data: { actorId: user.id, action: "auth.register", targetType: "user", targetId: user.id, ipAddress: request.ip } });
    setSessionCookie(response, token);
    response.status(201).json({ user: publicUser(user) });
  }));

  api.post("/auth/login", authLimiter, asyncRoute(async (request, response) => {
    const input = loginSchema.parse(request.body);
    try {
      const user = await authenticateUser(db, input.email, input.password);
      const token = await createSession(db, user.id);
      await db.auditLog.create({ data: { actorId: user.id, action: "auth.login", targetType: "user", targetId: user.id, ipAddress: request.ip } });
      setSessionCookie(response, token);
      response.json({ user: publicUser(user) });
    } catch (error) {
      if (error instanceof HttpError && error.status === 401) {
        await db.auditLog.create({ data: { action: "auth.login_failed", targetType: "user", metadata: { email: input.email.toLowerCase() }, ipAddress: request.ip } });
      }
      throw error;
    }
  }));

  api.get("/auth/me", authenticate, (request, response) => response.json({ user: publicUser({ ...accountOf(request.authUser!), createdAt: request.authUser!.createdAt, wallet: { accountNumber: request.authUser!.accountNumber, balanceMinor: request.authUser!.balanceMinor } }) }));

  api.post("/auth/logout", authenticate, asyncRoute(async (request, response) => {
    if (request.sessionId) await db.session.delete({ where: { id: request.sessionId } });
    await db.auditLog.create({ data: { actorId: request.authUser!.id, action: "auth.logout", targetType: "user", targetId: request.authUser!.id, ipAddress: request.ip } });
    clearSessionCookie(response);
    response.status(204).end();
  }));

  api.get("/wallet", authenticate, asyncRoute(async (request, response) => {
    const user = request.authUser!;
    const wallet = await db.wallet.findUniqueOrThrow({ where: { id: user.walletId }, select: { id: true, currency: true, balanceMinor: true, accountNumber: true, createdAt: true } });
    response.json({ wallet: { ...wallet, balanceMinor: wallet.balanceMinor.toString(), createdAt: wallet.createdAt.toISOString() } });
  }));

  api.post("/wallet/deposits", authenticate, asyncRoute(async (request, response) => {
    if (!depositsEnabled) throw new HttpError(404, "This endpoint is not available", "NOT_FOUND");
    const input = depositSchema.parse(request.body);
    const transaction = await createDevelopmentDeposit(db, { userId: request.authUser!.id, walletId: request.authUser!.walletId, ...input });
    response.status(201).json({ transaction: { id: transaction.id, amountMinor: transaction.amountMinor.toString(), createdAt: transaction.createdAt.toISOString() } });
  }));

  api.post("/transfers", authenticate, asyncRoute(async (request, response) => {
    const input = transferSchema.parse(request.body);
    const transaction = await createTransfer(db, { userId: request.authUser!.id, walletId: request.authUser!.walletId, ...input });
    response.status(201).json({ transaction: { id: transaction.id, amountMinor: transaction.amountMinor.toString(), counterparty: transaction.counterparty, accountNumber: transaction.accountNumber, createdAt: transaction.createdAt.toISOString() } });
  }));

  api.get("/transactions", authenticate, asyncRoute(async (request, response) => {
    const query = transactionQuerySchema.parse(request.query);
    const walletId = request.authUser!.walletId;
    const conditions: Prisma.TransactionWhereInput[] = [{ OR: [{ senderWalletId: walletId }, { recipientWalletId: walletId }] }];
    if (query.kind) conditions.push({ kind: query.kind });
    if (query.direction === "in") conditions.push({ recipientWalletId: walletId });
    if (query.direction === "out") conditions.push({ senderWalletId: walletId });
    if (query.from || query.to) conditions.push({ createdAt: { ...(query.from ? { gte: new Date(query.from) } : {}), ...(query.to ? { lte: new Date(query.to) } : {}) } });
    if (query.search) {
      const search = query.search;
      conditions.push({ OR: [
        { memo: { contains: search, mode: "insensitive" } },
        { senderWallet: { accountNumber: { contains: search, mode: "insensitive" } } },
        { senderWallet: { user: { name: { contains: search, mode: "insensitive" } } } },
        { recipientWallet: { accountNumber: { contains: search, mode: "insensitive" } } },
        { recipientWallet: { user: { name: { contains: search, mode: "insensitive" } } } },
      ] });
    }
    const orderBy = query.sort === "oldest" ? { createdAt: "asc" as const }
      : query.sort === "amount-high" ? { amountMinor: "desc" as const }
        : query.sort === "amount-low" ? { amountMinor: "asc" as const }
          : { createdAt: "desc" as const };
    const records = await db.transaction.findMany({
      where: { AND: conditions },
      include: { senderWallet: { include: { user: { select: { name: true } } } }, recipientWallet: { include: { user: { select: { name: true } } } } },
      orderBy,
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const hasMore = records.length > query.limit;
    const items = records.slice(0, query.limit).map((transaction) => transactionItem(transaction, walletId));
    response.json({ transactions: items, nextCursor: hasMore ? items.at(-1)?.id ?? null : null });
  }));

  api.get("/dashboard", authenticate, asyncRoute(async (request, response) => {
    const walletId = request.authUser!.walletId;
    const currentMonth = new Date();
    currentMonth.setUTCDate(1);
    currentMonth.setUTCHours(0, 0, 0, 0);
    const chartStart = new Date(Date.UTC(currentMonth.getUTCFullYear(), currentMonth.getUTCMonth() - 5, 1));
    const transactions = await db.transaction.findMany({
      where: {
        OR: [{ senderWalletId: walletId }, { recipientWalletId: walletId }],
        createdAt: { gte: chartStart },
      },
      include: { senderWallet: { include: { user: { select: { name: true } } } }, recipientWallet: { include: { user: { select: { name: true } } } } },
      orderBy: { createdAt: "desc" },
    });
    const months = Array.from({ length: 6 }, (_, index) => {
      const date = new Date(Date.UTC(chartStart.getUTCFullYear(), chartStart.getUTCMonth() + index, 1));
      return { key: `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`, label: new Intl.DateTimeFormat("en", { month: "short", timeZone: "UTC" }).format(date), inMinor: 0n, outMinor: 0n };
    });
    let moneyIn = 0n;
    let moneyOut = 0n;
    const categories = new Map<string, bigint>();
    for (const transaction of transactions) {
      const outgoing = transaction.senderWalletId === walletId;
      const month = months.find((item) => item.key === `${transaction.createdAt.getUTCFullYear()}-${String(transaction.createdAt.getUTCMonth() + 1).padStart(2, "0")}`);
      if (outgoing) {
        if (transaction.createdAt >= currentMonth) moneyOut += transaction.amountMinor;
        if (month) month.outMinor += transaction.amountMinor;
        const category = transaction.category ?? "Other";
        categories.set(category, (categories.get(category) ?? 0n) + transaction.amountMinor);
      } else {
        if (transaction.createdAt >= currentMonth) moneyIn += transaction.amountMinor;
        if (month) month.inMinor += transaction.amountMinor;
      }
    }
    response.json({
      balanceMinor: request.authUser!.balanceMinor.toString(),
      moneyInMinor: moneyIn.toString(),
      moneyOutMinor: moneyOut.toString(),
      chart: months.map(({ label, inMinor, outMinor }) => ({ label, inMinor: inMinor.toString(), outMinor: outMinor.toString() })),
      categories: [...categories.entries()].sort((a, b) => a[1] > b[1] ? -1 : a[1] < b[1] ? 1 : 0).slice(0, 5).map(([name, amount]) => ({ name, amountMinor: amount.toString() })),
      recent: transactions.slice(0, 5).map((transaction) => transactionItem(transaction, walletId)),
    });
  }));

  api.get("/admin/users", authenticate, requireAdmin, asyncRoute(async (_request, response) => {
    const users = await db.user.findMany({ include: { wallet: true }, orderBy: { createdAt: "desc" }, take: 200 });
    response.json({ users: users.filter((user) => user.wallet).map((user) => publicUser({ ...user, wallet: user.wallet! })) });
  }));

  api.get("/admin/wallets", authenticate, requireAdmin, asyncRoute(async (_request, response) => {
    const wallets = await db.wallet.findMany({ include: { user: { select: { id: true, name: true, email: true, status: true } } }, orderBy: { createdAt: "desc" }, take: 200 });
    response.json({ wallets: wallets.map((wallet) => ({ id: wallet.id, accountNumber: wallet.accountNumber, currency: wallet.currency, balanceMinor: wallet.balanceMinor.toString(), createdAt: wallet.createdAt.toISOString(), user: wallet.user })) });
  }));

  api.patch("/admin/users/:userId/status", authenticate, requireAdmin, asyncRoute(async (request, response) => {
    const { status } = adminStatusSchema.parse(request.body);
    const userId = Array.isArray(request.params.userId) ? request.params.userId[0] : request.params.userId;
    if (!userId) throw new HttpError(400, "User id is required", "INVALID_USER_ID");
    if (userId === request.authUser!.id && status === "SUSPENDED") throw new HttpError(400, "You cannot suspend your own admin account", "SELF_SUSPENSION");
    const user = await db.$transaction(async (tx) => {
      const updated = await tx.user.update({ where: { id: userId }, data: { status }, include: { wallet: true } });
      if (status === "SUSPENDED") await tx.session.deleteMany({ where: { userId: updated.id } });
      await tx.auditLog.create({ data: { actorId: request.authUser!.id, action: "admin.user_status_changed", targetType: "user", targetId: updated.id, metadata: { status }, ipAddress: request.ip } });
      return updated;
    });
    if (!user.wallet) throw new HttpError(404, "Wallet not found", "WALLET_NOT_FOUND");
    response.json({ user: publicUser({ ...user, wallet: user.wallet }) });
  }));

  app.use("/api", api);
  app.use((_request, _response, next) => next(new HttpError(404, "Route not found", "NOT_FOUND")));
  app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
    if (error instanceof HttpError) return response.status(error.status).json({ error: error.message, code: error.code });
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return response.status(404).json({ error: "Record not found", code: "NOT_FOUND" });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return response.status(409).json({ error: "A record with those details already exists", code: "CONFLICT" });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return response.status(409).json({ error: "The wallet changed during this request. Please retry.", code: "TRANSACTION_CONFLICT" });
    }
    if (error instanceof SyntaxError) return response.status(400).json({ error: "Request body must be valid JSON", code: "INVALID_JSON" });
    if (typeof error === "object" && error !== null && "issues" in error) {
      const issues = Array.isArray(error.issues) ? error.issues : [];
      return response.status(400).json({ error: "Please check the submitted details", code: "VALIDATION_ERROR", details: issues.map((issue) => ({ path: issue.path, message: issue.message })) });
    }
    console.error("Unhandled API error", error);
    return response.status(500).json({ error: "Something went wrong", code: "INTERNAL_ERROR" });
  });

  return app;
}

export function sessionCookieName() {
  return SESSION_COOKIE;
}
