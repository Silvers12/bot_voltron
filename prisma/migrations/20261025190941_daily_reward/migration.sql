-- AlterEnum
ALTER TYPE "TransactionType" ADD VALUE 'DAILY';

-- AlterTable
ALTER TABLE "GuildSettings" ADD COLUMN     "dailyAmount" INTEGER NOT NULL DEFAULT 100,
ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT 'Europe/Paris';

-- CreateTable
CREATE TABLE "DailyClaim" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "dayKey" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyClaim_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DailyClaim_transactionId_key" ON "DailyClaim"("transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "DailyClaim_memberId_dayKey_key" ON "DailyClaim"("memberId", "dayKey");

-- AddForeignKey
ALTER TABLE "DailyClaim" ADD CONSTRAINT "DailyClaim_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
