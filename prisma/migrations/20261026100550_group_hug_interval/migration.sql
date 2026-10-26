-- AlterTable
ALTER TABLE "GuildSettings" ALTER COLUMN "groupHugMaxIntervalMinutes" SET DEFAULT 360,
ALTER COLUMN "groupHugMinIntervalMinutes" SET DEFAULT 60;

-- Les serveurs encore sur l'ancien intervalle par défaut (3 h – 8 h) passent au nouveau (1 h – 6 h).
UPDATE "GuildSettings" SET "groupHugMinIntervalMinutes" = 60, "groupHugMaxIntervalMinutes" = 360
WHERE "groupHugMinIntervalMinutes" = 180 AND "groupHugMaxIntervalMinutes" = 480;
