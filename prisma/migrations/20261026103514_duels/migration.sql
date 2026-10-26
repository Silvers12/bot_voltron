-- CreateEnum
CREATE TYPE "DuelState" AS ENUM ('PENDING', 'RESOLVED', 'DECLINED', 'CANCELLED', 'EXPIRED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TransactionType" ADD VALUE 'DUEL_STAKE';
ALTER TYPE "TransactionType" ADD VALUE 'DUEL_WIN';
ALTER TYPE "TransactionType" ADD VALUE 'DUEL_REFUND';

-- AlterTable
ALTER TABLE "GuildSettings" ADD COLUMN     "duelMaxStake" INTEGER NOT NULL DEFAULT 5000,
ADD COLUMN     "duelMinStake" INTEGER NOT NULL DEFAULT 10;

-- CreateTable
CREATE TABLE "Duel" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "messageId" TEXT,
    "challengerId" TEXT NOT NULL,
    "opponentId" TEXT NOT NULL,
    "stake" INTEGER NOT NULL,
    "state" "DuelState" NOT NULL DEFAULT 'PENDING',
    "winnerId" TEXT,
    "challengerRoll" INTEGER,
    "opponentRoll" INTEGER,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "Duel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Duel_guildId_state_idx" ON "Duel"("guildId", "state");

-- CreateIndex
CREATE INDEX "Duel_challengerId_state_idx" ON "Duel"("challengerId", "state");

-- AddForeignKey
ALTER TABLE "Duel" ADD CONSTRAINT "Duel_challengerId_fkey" FOREIGN KEY ("challengerId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Duel" ADD CONSTRAINT "Duel_opponentId_fkey" FOREIGN KEY ("opponentId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
