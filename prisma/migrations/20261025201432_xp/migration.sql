-- AlterTable
ALTER TABLE "GuildSettings" ADD COLUMN     "voiceIntervalMinutes" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "xpMessageCooldownSeconds" INTEGER NOT NULL DEFAULT 60,
ADD COLUMN     "xpPerMessage" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "xpPerVoiceInterval" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "Member" ADD COLUMN     "lastMessageXpAt" TIMESTAMP(3),
ADD COLUMN     "messageCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "voiceSeconds" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "xp" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "VoiceSession" (
    "memberId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastTickAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VoiceSession_pkey" PRIMARY KEY ("memberId")
);

-- CreateIndex
CREATE INDEX "Member_guildId_xp_idx" ON "Member"("guildId", "xp" DESC);

-- AddForeignKey
ALTER TABLE "VoiceSession" ADD CONSTRAINT "VoiceSession_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
