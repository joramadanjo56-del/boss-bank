CREATE TYPE "TransactionStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');

ALTER TABLE "Transaction"
  ADD COLUMN "status" "TransactionStatus" NOT NULL DEFAULT 'COMPLETED',
  ADD COLUMN "idempotencyKey" VARCHAR(80);

CREATE UNIQUE INDEX "Transaction_idempotencyKey_key"
  ON "Transaction"("idempotencyKey");