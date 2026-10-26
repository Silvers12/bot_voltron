-- Machine à sous : prix fixe par tour, à la place des mises min/max et de la part de cagnotte.
ALTER TABLE "GuildSettings" DROP COLUMN "slotMinBet",
DROP COLUMN "slotMaxBet",
DROP COLUMN "slotJackpotContributionPercent",
ADD COLUMN "slotBet" INTEGER NOT NULL DEFAULT 50;
