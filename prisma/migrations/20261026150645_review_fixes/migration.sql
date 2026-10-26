-- AlterTable
ALTER TABLE "Member" ADD COLUMN     "slotJackpots" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "slotSpins" INTEGER NOT NULL DEFAULT 0;

-- Reprise des compteurs de machine à sous depuis l'historique des transactions
UPDATE "Member" m SET
  "slotSpins" = (SELECT count(*) FROM "Transaction" t JOIN "Account" a ON a.id = t."accountId" WHERE a."memberId" = m.id AND t.type = 'BET' AND t.reason = 'Machine à sous : mise'),
  "slotJackpots" = (SELECT count(*) FROM "Transaction" t JOIN "Account" a ON a.id = t."accountId" WHERE a."memberId" = m.id AND t.type = 'BET_WIN' AND t.reason LIKE 'Machine à sous : JACKPOT%');

-- Un seul défi en attente par défieur (verrou en base, pas seulement en code)
CREATE UNIQUE INDEX "Duel_one_pending_per_challenger" ON "Duel"("challengerId") WHERE state = 'PENDING';
