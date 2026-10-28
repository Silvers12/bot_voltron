ALTER TABLE "GuildSettings" ALTER COLUMN "theftCooldownHours" SET DEFAULT 4;
UPDATE "GuildSettings" SET "theftCooldownHours" = 4 WHERE "theftCooldownHours" = 24;
