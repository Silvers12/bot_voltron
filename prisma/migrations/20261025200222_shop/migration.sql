-- CreateEnum
CREATE TYPE "ItemKind" AS ENUM ('COLLECTIBLE', 'ROLE');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TransactionType" ADD VALUE 'PURCHASE';
ALTER TYPE "TransactionType" ADD VALUE 'REFUND';

-- CreateTable
CREATE TABLE "ShopItem" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "emoji" TEXT,
    "price" INTEGER NOT NULL,
    "kind" "ItemKind" NOT NULL DEFAULT 'COLLECTIBLE',
    "roleId" TEXT,
    "stock" INTEGER,
    "maxPerMember" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryItem" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ShopItem_guildId_active_sortOrder_idx" ON "ShopItem"("guildId", "active", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "ShopItem_guildId_name_key" ON "ShopItem"("guildId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryItem_memberId_itemId_key" ON "InventoryItem"("memberId", "itemId");

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "ShopItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Garanties en base : stock et quantités jamais négatifs, prix positif ou nul.
ALTER TABLE "ShopItem" ADD CONSTRAINT "ShopItem_stock_non_negative" CHECK ("stock" IS NULL OR "stock" >= 0);
ALTER TABLE "ShopItem" ADD CONSTRAINT "ShopItem_price_non_negative" CHECK ("price" >= 0);
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_quantity_positive" CHECK ("quantity" >= 0);
