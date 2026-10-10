-- CreateEnum
CREATE TYPE "OperatingMode" AS ENUM ('Team', 'Solo');

-- AlterTable
ALTER TABLE "TimeEntry" ADD COLUMN     "approvalMode" TEXT,
ADD COLUMN     "billable" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "captureGroupId" UUID,
ADD COLUMN     "revision" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "voidedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "customerId" UUID,
ADD COLUMN     "defaultBillable" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "ServiceOrder" ADD COLUMN     "defaultBillable" BOOLEAN;

-- CreateTable
CREATE TABLE "InstallationSettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "mode" "OperatingMode" NOT NULL DEFAULT 'Team',
    "ownerEmployeeId" UUID,
    "setupCompleted" BOOLEAN NOT NULL DEFAULT false,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InstallationSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SoloPolicy" (
    "id" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "targetEnabled" BOOLEAN NOT NULL DEFAULT false,
    "weeklyTargetMinutes" INTEGER,
    "workingDays" INTEGER NOT NULL DEFAULT 31,
    "leaveEnabled" BOOLEAN NOT NULL DEFAULT false,
    "annualLeaveDays" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "holidayCalendar" TEXT NOT NULL DEFAULT 'NONE',
    "holidayDates" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "breakRules" JSONB NOT NULL DEFAULT '[]',
    "coreTimeHintsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "dailyBlockEnabled" BOOLEAN NOT NULL DEFAULT false,
    "gpsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SoloPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "note" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimeEntryAudit" (
    "id" UUID NOT NULL,
    "timeEntryId" UUID NOT NULL,
    "actorId" UUID,
    "action" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "reason" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TimeEntryAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonalDay" (
    "id" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "from" DATE NOT NULL,
    "to" DATE NOT NULL,
    "note" TEXT,
    "halfDayStart" BOOLEAN NOT NULL DEFAULT false,
    "halfDayEnd" BOOLEAN NOT NULL DEFAULT false,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PersonalDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstallationEvent" (
    "id" UUID NOT NULL,
    "actorId" UUID,
    "action" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InstallationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InstallationSettings_ownerEmployeeId_key" ON "InstallationSettings"("ownerEmployeeId");

-- CreateIndex
CREATE INDEX "SoloPolicy_employeeId_effectiveFrom_createdAt_idx" ON "SoloPolicy"("employeeId", "effectiveFrom", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_code_key" ON "Customer"("code");

-- CreateIndex
CREATE INDEX "TimeEntryAudit_timeEntryId_occurredAt_idx" ON "TimeEntryAudit"("timeEntryId", "occurredAt");

-- CreateIndex
CREATE INDEX "PersonalDay_employeeId_from_idx" ON "PersonalDay"("employeeId", "from");

-- CreateIndex
CREATE INDEX "InstallationEvent_occurredAt_idx" ON "InstallationEvent"("occurredAt");

-- CreateIndex
CREATE INDEX "TimeEntry_captureGroupId_idx" ON "TimeEntry"("captureGroupId");

-- CreateIndex
CREATE INDEX "Project_customerId_idx" ON "Project"("customerId");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallationSettings" ADD CONSTRAINT "InstallationSettings_ownerEmployeeId_fkey" FOREIGN KEY ("ownerEmployeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SoloPolicy" ADD CONSTRAINT "SoloPolicy_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeEntryAudit" ADD CONSTRAINT "TimeEntryAudit_timeEntryId_fkey" FOREIGN KEY ("timeEntryId") REFERENCES "TimeEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeEntryAudit" ADD CONSTRAINT "TimeEntryAudit_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonalDay" ADD CONSTRAINT "PersonalDay_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallationEvent" ADD CONSTRAINT "InstallationEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Existing installations remain in Team mode.
INSERT INTO "InstallationSettings" ("id", "mode", "setupCompleted", "updatedAt") VALUES (1, 'Team', true, CURRENT_TIMESTAMP);
ALTER TABLE "InstallationSettings" ADD CONSTRAINT "installation_singleton" CHECK ("id" = 1);
ALTER TABLE "InstallationSettings" ADD CONSTRAINT "solo_requires_owner" CHECK ("mode" <> 'Solo' OR "ownerEmployeeId" IS NOT NULL);
ALTER TABLE "SoloPolicy" ADD CONSTRAINT "solo_valid_working_days" CHECK ("workingDays" BETWEEN 1 AND 127);
ALTER TABLE "SoloPolicy" ADD CONSTRAINT "solo_valid_target" CHECK (NOT "targetEnabled" OR ("weeklyTargetMinutes" > 0 AND "weeklyTargetMinutes" <= 10080));
ALTER TABLE "PersonalDay" ADD CONSTRAINT "personal_day_range" CHECK ("to" >= "from");
ALTER TABLE "PersonalDay" ADD CONSTRAINT "personal_day_kind" CHECK ("kind" IN ('Free', 'Vacation', 'Sickness', 'Training'));

-- Voided entries remain auditable but no longer reserve an interval or timer.
DROP INDEX "TimeEntry_one_open_per_employee_idx";
CREATE UNIQUE INDEX "TimeEntry_one_open_per_employee_idx" ON "TimeEntry"("employeeId") WHERE "clockOut" IS NULL AND "voidedAt" IS NULL;
ALTER TABLE "TimeEntry" DROP CONSTRAINT "TimeEntry_no_employee_overlap_excl";
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_no_employee_overlap_excl"
  EXCLUDE USING gist ("employeeId" WITH =, tsrange("clockIn", "clockOut", '[)') WITH &&)
  WHERE ("clockOut" IS NOT NULL AND "status" <> 'Rejected' AND "voidedAt" IS NULL);
