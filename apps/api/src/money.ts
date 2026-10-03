import type { PrismaClient } from "@boss-bank/db";
import { Prisma } from "@boss-bank/db";
import { HttpError } from "./errors.js";

const systemAccount = "DEVELOPMENT_CLEARING";

async function serializable<T>(db: PrismaClient, operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await db.$transaction(operation, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      const retryable = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
      if (!retryable || attempt === 2) throw error;
    }
  }
  throw new HttpError(409, "The wallet changed during this request. Please retry.", "TRANSACTION_CONFLICT");
}

export async function createDevelopmentDeposit(
  db: PrismaClient,
  input: { userId: string; walletId: string; amountMinor: string; memo?: string },
) {
  const amount = BigInt(input.amountMinor);
  return serializable(db, async (tx) => {
    const wallet = await tx.wallet.findUnique({ where: { id: input.walletId }, select: { id: true, userId: true } });
    if (!wallet || wallet.userId !== input.userId) throw new HttpError(404, "Wallet not found", "WALLET_NOT_FOUND");

    const transaction = await tx.transaction.create({
      data: {
        kind: "DEPOSIT",
        amountMinor: amount,
        memo: input.memo ?? "Development deposit",
        recipientWalletId: wallet.id,
        ledgerEntries: {
          create: [
            { accountType: "WALLET", walletId: wallet.id, direction: "CREDIT", amountMinor: amount },
            { accountType: "SYSTEM", systemAccount, direction: "DEBIT", amountMinor: amount },
          ],
        },
      },
    });
    await tx.wallet.update({ where: { id: wallet.id }, data: { balanceMinor: { increment: amount } } });
    await tx.auditLog.create({
      data: { actorId: input.userId, action: "wallet.development_deposit", targetType: "transaction", targetId: transaction.id, metadata: { amountMinor: input.amountMinor } },
    });
    return transaction;
  });
}

export async function createTransfer(
  db: PrismaClient,
  input: {
    userId: string;
    walletId: string;
    accountNumber: string;
    amountMinor: string;
    memo?: string;
    category: string;
  },
) {
  if (input.accountNumber.length !== 12 || !/^BB\d{10}$/.test(input.accountNumber)) {
    throw new HttpError(400, "Enter a valid Boss Bank account number", "INVALID_ACCOUNT_NUMBER");
  }
  if (BigInt(input.amountMinor) <= 0n) throw new HttpError(400, "Amount must be greater than zero", "INVALID_AMOUNT");

  return serializable(db, async (tx) => {
    const [sender, recipient] = await Promise.all([
      tx.wallet.findUnique({ where: { id: input.walletId } }),
      tx.wallet.findUnique({ where: { accountNumber: input.accountNumber }, include: { user: { select: { id: true, name: true, status: true } } } }),
    ]);
    if (!sender || sender.userId !== input.userId) throw new HttpError(404, "Wallet not found", "WALLET_NOT_FOUND");
    if (!recipient || recipient.user.status !== "ACTIVE") throw new HttpError(404, "No active wallet matches that account number", "RECIPIENT_NOT_FOUND");
    if (recipient.id === sender.id) throw new HttpError(400, "You cannot transfer to your own account", "SELF_TRANSFER");

    const amount = BigInt(input.amountMinor);
    const debited = await tx.wallet.updateMany({
      where: { id: sender.id, balanceMinor: { gte: amount } },
      data: { balanceMinor: { decrement: amount } },
    });
    if (debited.count !== 1) throw new HttpError(400, "Your wallet does not have enough available funds", "INSUFFICIENT_FUNDS");
    await tx.wallet.update({ where: { id: recipient.id }, data: { balanceMinor: { increment: amount } } });

    const transaction = await tx.transaction.create({
      data: {
        kind: "TRANSFER",
        amountMinor: amount,
        memo: input.memo,
        category: input.category,
        senderWalletId: sender.id,
        recipientWalletId: recipient.id,
        ledgerEntries: {
          create: [
            { accountType: "WALLET", walletId: sender.id, direction: "DEBIT", amountMinor: amount },
            { accountType: "WALLET", walletId: recipient.id, direction: "CREDIT", amountMinor: amount },
          ],
        },
      },
    });
    await tx.auditLog.create({
      data: { actorId: input.userId, action: "wallet.transfer", targetType: "transaction", targetId: transaction.id, metadata: { recipientUserId: recipient.user.id, amountMinor: input.amountMinor } },
    });
    return { ...transaction, counterparty: recipient.user.name, accountNumber: recipient.accountNumber };
  });
}
