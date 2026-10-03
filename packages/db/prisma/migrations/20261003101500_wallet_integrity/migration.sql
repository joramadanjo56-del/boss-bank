-- Keep stored balances and ledger records valid even if an application path regresses.
ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_balanceMinor_nonnegative_check" CHECK ("balanceMinor" >= 0);
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_amountMinor_positive_check" CHECK ("amountMinor" > 0);
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_amountMinor_positive_check" CHECK ("amountMinor" > 0);
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_account_owner_check" CHECK (
    ("accountType" = 'WALLET' AND "walletId" IS NOT NULL AND "systemAccount" IS NULL)
    OR ("accountType" = 'SYSTEM' AND "walletId" IS NULL AND "systemAccount" IS NOT NULL)
);