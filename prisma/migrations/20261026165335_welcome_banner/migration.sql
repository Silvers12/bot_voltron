-- AlterTable
ALTER TABLE "GuildSettings" ADD COLUMN     "welcomeBanner" BYTEA,
ADD COLUMN     "welcomeBannerType" TEXT,
ADD COLUMN     "welcomeText" TEXT;
