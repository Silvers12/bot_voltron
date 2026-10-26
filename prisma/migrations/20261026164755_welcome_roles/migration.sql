-- AlterTable
ALTER TABLE "GuildSettings" ADD COLUMN     "notifyDuelRoleId" TEXT,
ADD COLUMN     "notifyHugRoleId" TEXT,
ADD COLUMN     "notifyLotteryRoleId" TEXT,
ADD COLUMN     "welcomeChannelId" TEXT,
ADD COLUMN     "welcomeMessageId" TEXT;
