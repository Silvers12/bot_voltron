-- AlterTable
ALTER TABLE "GuildSettings" ADD COLUMN     "disabledFeatures" TEXT[] DEFAULT ARRAY[]::TEXT[];
