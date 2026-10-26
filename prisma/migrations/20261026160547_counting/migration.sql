-- AlterEnum
ALTER TYPE "TransactionType" ADD VALUE 'COUNTING_FINE';

-- AlterTable
ALTER TABLE "GuildSettings" ADD COLUMN     "countingChannelId" TEXT,
ADD COLUMN     "countingFine" INTEGER NOT NULL DEFAULT 1000;

-- CreateTable
CREATE TABLE "Counting" (
    "guildId" TEXT NOT NULL,
    "current" INTEGER NOT NULL DEFAULT 0,
    "lastMemberId" TEXT,
    "best" INTEGER NOT NULL DEFAULT 0,
    "failures" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Counting_pkey" PRIMARY KEY ("guildId")
);
