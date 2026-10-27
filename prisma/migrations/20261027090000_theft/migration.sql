-- AlterEnum
ALTER TYPE "TransactionType" ADD VALUE 'THEFT_GAIN';
ALTER TYPE "TransactionType" ADD VALUE 'THEFT_LOSS';
ALTER TYPE "TransactionType" ADD VALUE 'THEFT_FINE';
ALTER TYPE "TransactionType" ADD VALUE 'THEFT_COMPENSATION';

-- AlterTable
ALTER TABLE "GuildSettings" ADD COLUMN     "theftMaxPercent" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN     "theftSuccessPercent" INTEGER NOT NULL DEFAULT 50,
ADD COLUMN     "theftCooldownHours" INTEGER NOT NULL DEFAULT 24;

-- AlterTable
ALTER TABLE "Member" ADD COLUMN     "lastTheftAt" TIMESTAMP(3);
