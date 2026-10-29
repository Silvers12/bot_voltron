ALTER TABLE "GuildSettings" ADD COLUMN "prisonRoleId" TEXT,
ADD COLUMN "prisonMinutes" INTEGER NOT NULL DEFAULT 60;

ALTER TABLE "Member" ADD COLUMN "prisonUntil" TIMESTAMP(3);

CREATE TABLE "CountingMessage" (
    "messageId" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "accepted" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CountingMessage_pkey" PRIMARY KEY ("messageId")
);

CREATE INDEX "CountingMessage_guildId_createdAt_idx" ON "CountingMessage"("guildId", "createdAt");
