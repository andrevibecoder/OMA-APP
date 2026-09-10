-- DropForeignKey
ALTER TABLE "Review" DROP CONSTRAINT "Review_scorerId_fkey";

-- DropForeignKey
ALTER TABLE "Review" DROP CONSTRAINT "Review_subjectId_fkey";

-- AlterTable
ALTER TABLE "Review" ALTER COLUMN "scorerId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "Review_periodId_idx" ON "Review"("periodId");

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_scorerId_fkey" FOREIGN KEY ("scorerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
