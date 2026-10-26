-- CreateEnum
CREATE TYPE "LotteryState" AS ENUM ('OPEN', 'DRAWN');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TransactionType" ADD VALUE 'LOTTERY_TICKET';
ALTER TYPE "TransactionType" ADD VALUE 'LOTTERY_WIN';

-- AlterTable
ALTER TABLE "GuildSettings" ADD COLUMN     "lotteryChannelId" TEXT,
ADD COLUMN     "lotteryDrawHour" INTEGER NOT NULL DEFAULT 20,
ADD COLUMN     "lotteryDrawWeekday" INTEGER NOT NULL DEFAULT 7,
ADD COLUMN     "lotteryMaxTickets" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN     "lotterySeed" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lotteryTicketPrice" INTEGER NOT NULL DEFAULT 100;

-- CreateTable
CREATE TABLE "Lottery" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "drawAt" TIMESTAMP(3) NOT NULL,
    "state" "LotteryState" NOT NULL DEFAULT 'OPEN',
    "pot" INTEGER NOT NULL DEFAULT 0,
    "ticketPrice" INTEGER NOT NULL,
    "winnerMemberId" TEXT,
    "winnerTickets" INTEGER,
    "totalTickets" INTEGER NOT NULL DEFAULT 0,
    "drawnAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Lottery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LotteryEntry" (
    "lotteryId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "tickets" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "LotteryEntry_pkey" PRIMARY KEY ("lotteryId","memberId")
);

-- CreateIndex
CREATE INDEX "Lottery_guildId_state_idx" ON "Lottery"("guildId", "state");

-- AddForeignKey
ALTER TABLE "LotteryEntry" ADD CONSTRAINT "LotteryEntry_lotteryId_fkey" FOREIGN KEY ("lotteryId") REFERENCES "Lottery"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LotteryEntry" ADD CONSTRAINT "LotteryEntry_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
