-- AlterTable
ALTER TABLE "Period" ADD COLUMN     "endDate" TIMESTAMP(3);

-- Backfill existing periods to the calendar half-end (start + 6 months - 1 day):
-- H1 -> 30 Jun, H2 -> 31 Dec. Admins can adjust afterwards.
UPDATE "Period"
SET "endDate" = ("startDate" + INTERVAL '6 months' - INTERVAL '1 day')
WHERE "endDate" IS NULL;
