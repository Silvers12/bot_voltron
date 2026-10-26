-- AlterTable
ALTER TABLE "GuildSettings" ADD COLUMN     "slotJackpotContributionPercent" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "slotJackpotSeed" INTEGER NOT NULL DEFAULT 1000;

-- CreateTable
CREATE TABLE "SlotJackpot" (
    "guildId" TEXT NOT NULL,
    "pool" INTEGER NOT NULL,
    "lastWinnerDiscordId" TEXT,
    "lastWonAmount" INTEGER,
    "lastWonAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SlotJackpot_pkey" PRIMARY KEY ("guildId")
);
