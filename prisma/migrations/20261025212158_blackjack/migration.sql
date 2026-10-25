-- CreateEnum
CREATE TYPE "BlackjackState" AS ENUM ('PLAYING', 'WON', 'LOST', 'PUSH', 'BLACKJACK');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TransactionType" ADD VALUE 'BET';
ALTER TYPE "TransactionType" ADD VALUE 'BET_WIN';

-- AlterTable
ALTER TABLE "GuildSettings" ADD COLUMN     "blackjackMaxBet" INTEGER NOT NULL DEFAULT 2000,
ADD COLUMN     "blackjackMinBet" INTEGER NOT NULL DEFAULT 10;

-- CreateTable
CREATE TABLE "BlackjackGame" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "activeMemberId" TEXT,
    "bet" INTEGER NOT NULL,
    "doubled" BOOLEAN NOT NULL DEFAULT false,
    "deck" JSONB NOT NULL,
    "playerCards" JSONB NOT NULL,
    "dealerCards" JSONB NOT NULL,
    "state" "BlackjackState" NOT NULL DEFAULT 'PLAYING',
    "payout" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BlackjackGame_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BlackjackGame_activeMemberId_key" ON "BlackjackGame"("activeMemberId");

-- CreateIndex
CREATE INDEX "BlackjackGame_memberId_createdAt_idx" ON "BlackjackGame"("memberId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "BlackjackGame" ADD CONSTRAINT "BlackjackGame_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
