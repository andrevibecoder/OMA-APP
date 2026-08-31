-- CreateEnum
CREATE TYPE "MetricSource" AS ENUM ('MANUAL', 'API');

-- AlterTable
ALTER TABLE "Metric" ADD COLUMN     "apiKey" TEXT,
ADD COLUMN     "apiPath" TEXT,
ADD COLUMN     "apiUrl" TEXT,
ADD COLUMN     "source" "MetricSource" NOT NULL DEFAULT 'MANUAL';
