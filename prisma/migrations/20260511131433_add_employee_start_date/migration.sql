-- Add the carry-over column straight away (default 0 covers existing rows).
ALTER TABLE "Employee" ADD COLUMN "overtimeOpeningBalanceMinutes" INTEGER NOT NULL DEFAULT 0;

-- startDate must be NOT NULL for new rows, but existing rows have no value yet.
-- Add nullable, backfill from createdAt (best approximation of when the
-- employee entered the system), then enforce NOT NULL.
ALTER TABLE "Employee" ADD COLUMN "startDate" DATE;
UPDATE "Employee" SET "startDate" = "createdAt"::date WHERE "startDate" IS NULL;
ALTER TABLE "Employee" ALTER COLUMN "startDate" SET NOT NULL;
