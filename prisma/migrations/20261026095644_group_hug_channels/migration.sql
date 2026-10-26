/*
  Warnings:

  - You are about to drop the column `groupHugChannelId` on the `GuildSettings` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "GuildSettings" DROP COLUMN "groupHugChannelId",
ADD COLUMN     "groupHugChannelIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
