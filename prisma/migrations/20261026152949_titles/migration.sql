-- AlterEnum
ALTER TYPE "ItemKind" ADD VALUE 'TITLE';

-- AlterTable
ALTER TABLE "Member" ADD COLUMN     "titleItemId" TEXT;

-- AddForeignKey
ALTER TABLE "Member" ADD CONSTRAINT "Member_titleItemId_fkey" FOREIGN KEY ("titleItemId") REFERENCES "ShopItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
