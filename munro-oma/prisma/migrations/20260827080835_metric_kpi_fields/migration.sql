/*
  Warnings:

  - Changed the type of `target` on the `Metric` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "MetricUnit" AS ENUM ('NUMBER', 'CURRENCY', 'PERCENT', 'DAYS');

-- CreateEnum
CREATE TYPE "MetricDirection" AS ENUM ('HIGHER_BETTER', 'LOWER_BETTER');

-- AlterTable
ALTER TABLE "Metric" ADD COLUMN     "current" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "direction" "MetricDirection" NOT NULL DEFAULT 'HIGHER_BETTER',
ADD COLUMN     "unit" "MetricUnit" NOT NULL DEFAULT 'NUMBER',
DROP COLUMN "target",
ADD COLUMN     "target" DOUBLE PRECISION NOT NULL;
