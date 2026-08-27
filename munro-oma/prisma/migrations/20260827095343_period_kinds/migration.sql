/*
  Warnings:

  - You are about to drop the column `quarter` on the `Period` table. All the data in the column will be lost.
  - Added the required column `shortLabel` to the `Period` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "PeriodKind" AS ENUM ('QUARTER', 'HALF', 'ANNUAL');

-- AlterTable
ALTER TABLE "Period" DROP COLUMN "quarter",
ADD COLUMN     "kind" "PeriodKind" NOT NULL DEFAULT 'QUARTER',
ADD COLUMN     "shortLabel" TEXT NOT NULL;
