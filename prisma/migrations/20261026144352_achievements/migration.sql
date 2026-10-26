-- AlterEnum
ALTER TYPE "TransactionType" ADD VALUE 'ACHIEVEMENT';

-- AlterTable
ALTER TABLE "GuildSettings" ADD COLUMN     "achievementChannelId" TEXT;

-- CreateTable
CREATE TABLE "MemberAchievement" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "unlockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MemberAchievement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MemberAchievement_key_idx" ON "MemberAchievement"("key");

-- CreateIndex
CREATE UNIQUE INDEX "MemberAchievement_memberId_key_key" ON "MemberAchievement"("memberId", "key");

-- AddForeignKey
ALTER TABLE "MemberAchievement" ADD CONSTRAINT "MemberAchievement_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
