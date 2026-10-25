-- AlterEnum
ALTER TYPE "TransactionType" ADD VALUE 'WEEKLY';

-- AlterTable
ALTER TABLE "DailyClaim" ADD COLUMN     "streak" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "GuildSettings" ADD COLUMN     "dailyStreakBonusPercent" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "weeklyAmount" INTEGER NOT NULL DEFAULT 2000,
ALTER COLUMN "dailyAmount" SET DEFAULT 200;

-- CreateTable
CREATE TABLE "WeeklyClaim" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "weekKey" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WeeklyClaim_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WeeklyClaim_transactionId_key" ON "WeeklyClaim"("transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "WeeklyClaim_memberId_weekKey_key" ON "WeeklyClaim"("memberId", "weekKey");

-- AddForeignKey
ALTER TABLE "WeeklyClaim" ADD CONSTRAINT "WeeklyClaim_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Les serveurs encore sur l'ancien montant par défaut passent au nouveau.
UPDATE "GuildSettings" SET "dailyAmount" = 200 WHERE "dailyAmount" = 100;
