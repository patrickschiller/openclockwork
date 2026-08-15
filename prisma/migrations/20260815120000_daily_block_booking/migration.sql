-- Add a distinct source so self-approved daily blocks remain auditable.
ALTER TYPE "EntrySource" ADD VALUE 'DailyBlock';

-- HR enables direct daily-block booking per employee.
ALTER TABLE "Employee"
ADD COLUMN "allowDailyBlockBooking" BOOLEAN NOT NULL DEFAULT false;

-- Only DailyBlock entries populate bookingDate. PostgreSQL permits multiple
-- NULL values, while the unique index makes repeated clicks idempotent per day.
ALTER TABLE "TimeEntry"
ADD COLUMN "bookingDate" DATE;

CREATE UNIQUE INDEX "TimeEntry_employeeId_bookingDate_key"
ON "TimeEntry"("employeeId", "bookingDate");
