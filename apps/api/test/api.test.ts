import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import request from "supertest";
import { prisma } from "@boss-bank/db";
import { createApp } from "../src/app.js";

const origin = "http://localhost:5173";
const app = createApp(prisma, { webOrigin: origin, nodeEnv: "test", allowDevelopmentDeposits: true });
const unique = randomUUID().replaceAll("-", "").slice(0, 10);

before(async () => {
  const databaseUrl = process.env.DATABASE_URL ?? "";
  if (!new URL(databaseUrl).pathname.includes("_test")) throw new Error("Refusing to run integration tests unless DATABASE_URL points to a *_test database");
  await prisma.$connect();
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "AuditLog", "LedgerEntry", "Transaction", "Session", "Wallet", "User" RESTART IDENTITY CASCADE');
});

after(async () => {
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "AuditLog", "LedgerEntry", "Transaction", "Session", "Wallet", "User" RESTART IDENTITY CASCADE');
  await prisma.$disconnect();
});

async function register(name: string, email: string) {
  const response = await request(app)
    .post("/api/auth/register")
    .set("Origin", origin)
    .send({ name, email, password: "testing-passphrase-42" });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  const cookie = response.headers["set-cookie"]?.[0]?.split(";")[0];
  assert.ok(cookie?.startsWith("boss_session="));
  return { user: response.body.user as { id: string; accountNumber: string; balanceMinor: string }, cookie };
}

test("registration creates a member wallet and authenticates with an HTTP-only session", async () => {
  const email = `auth-${unique}@example.test`;
  const created = await register("Test Member", email);
  assert.match(created.user.accountNumber, /^BB\d{10}$/);
  assert.equal(created.user.balanceMinor, "0");

  const cookieHeader = (await request(app).get("/api/auth/me").set("Cookie", created.cookie)).body;
  assert.equal(cookieHeader.user.email, email);
  assert.equal(cookieHeader.user.role, "MEMBER");

  const duplicate = await request(app).post("/api/auth/register").set("Origin", origin).send({ name: "Duplicate", email, password: "testing-passphrase-42" });
  assert.equal(duplicate.status, 409);

  const login = await request(app).post("/api/auth/login").set("Origin", origin).send({ email, password: "testing-passphrase-42" });
  assert.equal(login.status, 200);
  assert.match(login.headers["set-cookie"][0], /HttpOnly/);
});

test("development deposits and transfers update both wallets with balanced ledger entries", async () => {
  const sender = await register("Sender Member", `sender-${unique}@example.test`);
  const recipient = await register("Recipient Member", `recipient-${unique}@example.test`);

  const deposit = await request(app).post("/api/wallet/deposits").set("Origin", origin).set("Cookie", sender.cookie).send({ amountMinor: "12500", memo: "Seed funds" });
  assert.equal(deposit.status, 201, JSON.stringify(deposit.body));

  const transfer = await request(app).post("/api/transfers").set("Origin", origin).set("Cookie", sender.cookie).send({
    accountNumber: recipient.user.accountNumber,
    amountMinor: "3200",
    memo: "Shared lunch",
    category: "Food",
  });
  assert.equal(transfer.status, 201, JSON.stringify(transfer.body));

  const balances = await Promise.all([
    prisma.wallet.findUniqueOrThrow({ where: { userId: sender.user.id } }),
    prisma.wallet.findUniqueOrThrow({ where: { userId: recipient.user.id } }),
  ]);
  assert.equal(balances[0].balanceMinor, 9300n);
  assert.equal(balances[1].balanceMinor, 3200n);

  const entries = await prisma.ledgerEntry.findMany({ where: { transactionId: transfer.body.transaction.id } });
  assert.equal(entries.length, 2);
  assert.equal(entries.reduce((sum, entry) => sum + (entry.direction === "CREDIT" ? entry.amountMinor : -entry.amountMinor), 0n), 0n);

  const overspend = await request(app).post("/api/transfers").set("Origin", origin).set("Cookie", sender.cookie).send({ accountNumber: recipient.user.accountNumber, amountMinor: "9301", category: "Other" });
  assert.equal(overspend.status, 400);
  assert.equal(overspend.body.code, "INSUFFICIENT_FUNDS");
});

test("cookie mutations from another origin are rejected", async () => {
  const response = await request(app).post("/api/auth/login").set("Origin", "https://attacker.example").send({ email: "nobody@example.test", password: "anything" });
  assert.equal(response.status, 403);
  assert.equal(response.body.code, "ORIGIN_NOT_ALLOWED");
});
