-- CreateEnum
CREATE TYPE "GroupHugState" AS ENUM ('OPEN', 'CLOSED');

-- AlterEnum
ALTER TYPE "TransactionType" ADD VALUE 'GROUP_HUG';

-- AlterTable
ALTER TABLE "GuildSettings" ADD COLUMN     "groupHugChannelId" TEXT,
ADD COLUMN     "groupHugDurationSeconds" INTEGER NOT NULL DEFAULT 60,
ADD COLUMN     "groupHugMaxIntervalMinutes" INTEGER NOT NULL DEFAULT 480,
ADD COLUMN     "groupHugMinIntervalMinutes" INTEGER NOT NULL DEFAULT 180,
ADD COLUMN     "groupHugReward" INTEGER NOT NULL DEFAULT 200,
ADD COLUMN     "nextGroupHugAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "GroupHug" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "messageId" TEXT,
    "rewardPerHugger" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "state" "GroupHugState" NOT NULL DEFAULT 'OPEN',
    "rewardEach" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "GroupHug_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupHugParticipant" (
    "hugId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GroupHugParticipant_pkey" PRIMARY KEY ("hugId","memberId")
);

-- CreateIndex
CREATE INDEX "GroupHug_guildId_state_idx" ON "GroupHug"("guildId", "state");

-- AddForeignKey
ALTER TABLE "GroupHugParticipant" ADD CONSTRAINT "GroupHugParticipant_hugId_fkey" FOREIGN KEY ("hugId") REFERENCES "GroupHug"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupHugParticipant" ADD CONSTRAINT "GroupHugParticipant_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
