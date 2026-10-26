-- AlterTable
ALTER TABLE "GuildSettings" ADD COLUMN     "levelBaseXp" INTEGER NOT NULL DEFAULT 20,
ADD COLUMN     "levelStepXp" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN     "levelUpChannelId" TEXT;

-- AlterTable
ALTER TABLE "Member" ADD COLUMN     "level" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "LevelRole" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "roleId" TEXT NOT NULL,

    CONSTRAINT "LevelRole_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LevelRole_guildId_level_key" ON "LevelRole"("guildId", "level");

-- CreateIndex
CREATE UNIQUE INDEX "LevelRole_guildId_roleId_key" ON "LevelRole"("guildId", "roleId");
