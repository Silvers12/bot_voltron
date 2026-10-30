ALTER TABLE "GuildSettings" ADD COLUMN "djRoleId" TEXT,
ADD COLUMN "musicChannelIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
