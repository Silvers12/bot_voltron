-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TransactionType" ADD VALUE 'WELCOME';
ALTER TYPE "TransactionType" ADD VALUE 'HUG_SENT';
ALTER TYPE "TransactionType" ADD VALUE 'HUG_RECEIVED';

-- AlterTable
ALTER TABLE "GuildSettings" ADD COLUMN     "startingBalance" INTEGER NOT NULL DEFAULT 5000,
ALTER COLUMN "currencySingular" SET DEFAULT 'cœur',
ALTER COLUMN "currencyPlural" SET DEFAULT 'cœurs',
ALTER COLUMN "currencySymbol" SET DEFAULT '❤️';

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "counterpartyDiscordId" TEXT;
