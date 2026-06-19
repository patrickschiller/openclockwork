-- Strengthen ER-model integrity around approvals, booking targets, schedules,
-- overlaps, and historical employee data.

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Existing databases may have been populated before these invariants existed.
UPDATE "Request" r
SET "approverId" = NULL
WHERE "approverId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "Employee" e WHERE e."id" = r."approverId"
  );

UPDATE "TimeEntry" te
SET "serviceOrderId" = NULL
WHERE te."serviceOrderId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "ServiceOrder" so
    WHERE so."id" = te."serviceOrderId"
      AND so."projectId" = te."projectId"
  );

WITH ranked_defaults AS (
  SELECT
    "id",
    row_number() OVER (ORDER BY "updatedAt" DESC, "createdAt" DESC, "id") AS rn
  FROM "WorkSchedule"
  WHERE "isDefault" = true
)
UPDATE "WorkSchedule" ws
SET "isDefault" = false
FROM ranked_defaults rd
WHERE ws."id" = rd."id"
  AND rd.rn > 1;

-- Prisma model alignment: these are still strings at the application boundary,
-- but PostgreSQL now stores the intended fixed HH:mm shape.
ALTER TABLE "WorkSchedule"
  ALTER COLUMN "frameStart" TYPE VARCHAR(5),
  ALTER COLUMN "frameEnd" TYPE VARCHAR(5);

ALTER TABLE "WorkScheduleCoreTime"
  ALTER COLUMN "start" TYPE VARCHAR(5),
  ALTER COLUMN "end" TYPE VARCHAR(5);

-- Request.approverId is the final manager/HR decision actor.
CREATE INDEX "Request_approverId_idx" ON "Request"("approverId");
ALTER TABLE "Request"
  ADD CONSTRAINT "Request_approverId_fkey"
  FOREIGN KEY ("approverId") REFERENCES "Employee"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- A service order must belong to the same project as the time entry.
ALTER TABLE "TimeEntry" DROP CONSTRAINT "TimeEntry_serviceOrderId_fkey";
CREATE UNIQUE INDEX "ServiceOrder_projectId_id_key" ON "ServiceOrder"("projectId", "id");
ALTER TABLE "TimeEntry"
  ADD CONSTRAINT "TimeEntry_serviceOrder_requires_project_chk"
  CHECK ("serviceOrderId" IS NULL OR "projectId" IS NOT NULL),
  ADD CONSTRAINT "TimeEntry_projectId_serviceOrderId_fkey"
  FOREIGN KEY ("projectId", "serviceOrderId") REFERENCES "ServiceOrder"("projectId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Times, ordering, and bitmasks.
ALTER TABLE "WorkSchedule"
  ADD CONSTRAINT "WorkSchedule_frameStart_hhmm_chk"
  CHECK ("frameStart" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  ADD CONSTRAINT "WorkSchedule_frameEnd_hhmm_chk"
  CHECK ("frameEnd" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  ADD CONSTRAINT "WorkSchedule_frame_order_chk"
  CHECK ("frameStart" < "frameEnd"),
  ADD CONSTRAINT "WorkSchedule_workingDays_range_chk"
  CHECK ("workingDays" BETWEEN 0 AND 127);

ALTER TABLE "WorkScheduleCoreTime"
  ADD CONSTRAINT "WorkScheduleCoreTime_start_hhmm_chk"
  CHECK ("start" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  ADD CONSTRAINT "WorkScheduleCoreTime_end_hhmm_chk"
  CHECK ("end" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  ADD CONSTRAINT "WorkScheduleCoreTime_order_chk"
  CHECK ("start" < "end"),
  ADD CONSTRAINT "WorkScheduleCoreTime_weekdays_range_chk"
  CHECK ("weekdays" BETWEEN 0 AND 127);

ALTER TABLE "TimeEntry"
  ADD CONSTRAINT "TimeEntry_clock_order_chk"
  CHECK ("clockOut" IS NULL OR "clockOut" > "clockIn");

ALTER TABLE "Absence"
  ADD CONSTRAINT "Absence_date_order_chk"
  CHECK ("to" >= "from");

ALTER TABLE "Request"
  ADD CONSTRAINT "Request_period_order_chk"
  CHECK ("to" >= "from");

-- Exactly one persisted default schedule at most. The built-in fallback still
-- applies if no row is flagged as default.
CREATE UNIQUE INDEX "WorkSchedule_single_default_idx"
  ON "WorkSchedule"("isDefault")
  WHERE "isDefault" = true;

-- No overlapping closed, non-rejected attendance intervals per employee.
CREATE UNIQUE INDEX "TimeEntry_one_open_per_employee_idx"
  ON "TimeEntry"("employeeId")
  WHERE "clockOut" IS NULL;

ALTER TABLE "TimeEntry"
  ADD CONSTRAINT "TimeEntry_no_employee_overlap_excl"
  EXCLUDE USING gist (
    "employeeId" WITH =,
    tsrange("clockIn", "clockOut", '[)') WITH &&
  )
  WHERE ("clockOut" IS NOT NULL AND "status" <> 'Rejected');

-- Absence rows are date ranges with an inclusive user-facing end date.
ALTER TABLE "Absence"
  ADD CONSTRAINT "Absence_no_employee_overlap_excl"
  EXCLUDE USING gist (
    "employeeId" WITH =,
    daterange("from", "to" + 1, '[)') WITH &&
  );

-- Productive employee data is deactivated, not hard-deleted. Restrict deletion
-- once historical/movement rows exist.
ALTER TABLE "TimeEntry" DROP CONSTRAINT "TimeEntry_employeeId_fkey";
ALTER TABLE "TimeEntry"
  ADD CONSTRAINT "TimeEntry_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "Employee"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Request" DROP CONSTRAINT "Request_employeeId_fkey";
ALTER TABLE "Request"
  ADD CONSTRAINT "Request_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "Employee"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Absence" DROP CONSTRAINT "Absence_employeeId_fkey";
ALTER TABLE "Absence"
  ADD CONSTRAINT "Absence_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "Employee"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProjectAssignment" DROP CONSTRAINT "ProjectAssignment_employeeId_fkey";
ALTER TABLE "ProjectAssignment"
  ADD CONSTRAINT "ProjectAssignment_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "Employee"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EmployeeLeaveAllowance" DROP CONSTRAINT "EmployeeLeaveAllowance_employeeId_fkey";
ALTER TABLE "EmployeeLeaveAllowance"
  ADD CONSTRAINT "EmployeeLeaveAllowance_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "Employee"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
