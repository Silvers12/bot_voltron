-- AlterTable
ALTER TABLE "GuildSettings" ADD COLUMN     "lotteryLastCallHours" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN     "lotteryReminderHour" INTEGER NOT NULL DEFAULT 18,
ADD COLUMN     "lotteryReminderWeekday" INTEGER NOT NULL DEFAULT 3;

-- AlterTable
ALTER TABLE "Lottery" ADD COLUMN     "channelId" TEXT,
ADD COLUMN     "lastCallSentAt" TIMESTAMP(3),
ADD COLUMN     "messageId" TEXT,
ADD COLUMN     "reminderSentAt" TIMESTAMP(3);
