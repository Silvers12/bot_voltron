-- AlterTable
ALTER TABLE "GuildSettings" ADD COLUMN     "commandChannelIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
