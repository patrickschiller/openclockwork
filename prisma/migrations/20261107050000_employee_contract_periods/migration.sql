-- Additive: legacy employees deliberately receive NO invented historical terms.
CREATE TABLE "EmployeeContractPeriod" (
  "id" UUID NOT NULL,
  "employeeId" UUID NOT NULL,
  "effectiveFrom" DATE NOT NULL,
  "effectiveTo" DATE,
  "employmentStart" DATE NOT NULL,
  "employmentEnd" DATE,
  "weeklyHours" DECIMAL(5,2) NOT NULL,
  "timeModel" "TimeModel" NOT NULL,
  "workingDays" INTEGER NOT NULL,
  "holidayCalendar" VARCHAR(20) NOT NULL,
  "holidayDates" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "scheduleLabel" TEXT,
  "confirmationNote" TEXT NOT NULL,
  "confirmedById" UUID,
  "revision" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmployeeContractPeriod_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EmployeeContractPeriod_effective_bounds" CHECK ("effectiveTo" IS NULL OR "effectiveTo" >= "effectiveFrom"),
  CONSTRAINT "EmployeeContractPeriod_employment_bounds" CHECK ("employmentEnd" IS NULL OR "employmentEnd" >= "employmentStart"),
  CONSTRAINT "EmployeeContractPeriod_hours" CHECK ("weeklyHours" >= 0 AND "weeklyHours" <= 168),
  CONSTRAINT "EmployeeContractPeriod_days" CHECK ("workingDays" BETWEEN 0 AND 127 AND ("weeklyHours" = 0 OR "workingDays" > 0)),
  CONSTRAINT "EmployeeContractPeriod_revision" CHECK ("revision" >= 0)
);
CREATE UNIQUE INDEX "EmployeeContractPeriod_employeeId_effectiveFrom_key" ON "EmployeeContractPeriod"("employeeId", "effectiveFrom");
CREATE INDEX "EmployeeContractPeriod_employeeId_effectiveTo_idx" ON "EmployeeContractPeriod"("employeeId", "effectiveTo");
ALTER TABLE "EmployeeContractPeriod" ADD CONSTRAINT "EmployeeContractPeriod_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EmployeeContractPeriod" ADD CONSTRAINT "EmployeeContractPeriod_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "EmployeeContractPeriodAudit" (
  "id" UUID NOT NULL,
  "periodId" UUID NOT NULL,
  "actorId" UUID,
  "action" TEXT NOT NULL,
  "before" JSONB,
  "after" JSONB NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmployeeContractPeriodAudit_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "EmployeeContractPeriodAudit_periodId_occurredAt_idx" ON "EmployeeContractPeriodAudit"("periodId", "occurredAt");
ALTER TABLE "EmployeeContractPeriodAudit" ADD CONSTRAINT "EmployeeContractPeriodAudit_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "EmployeeContractPeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EmployeeContractPeriodAudit" ADD CONSTRAINT "EmployeeContractPeriodAudit_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- All API writers serialize on the existing installation -> employee advisory
-- lock order, then lock Employee. Overlap validation and supersession are atomic.
