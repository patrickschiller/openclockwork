-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('Employee', 'Manager', 'HRAdmin');

-- CreateEnum
CREATE TYPE "TimeModel" AS ENUM ('Teilzeit', 'Vollzeit', 'Vertrauensarbeitszeit', 'Gleitzeit');

-- CreateEnum
CREATE TYPE "EntrySource" AS ENUM ('Manual', 'Pwa', 'Terminal', 'Erp');

-- CreateEnum
CREATE TYPE "EntryStatus" AS ENUM ('Open', 'Pending', 'Approved', 'Rejected');

-- CreateEnum
CREATE TYPE "RequestType" AS ENUM ('Vacation', 'HomeOffice', 'SpecialLeave', 'TimeAdjustment');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('Submitted', 'Approved', 'Rejected', 'Cancelled');

-- CreateEnum
CREATE TYPE "WorkflowState" AS ENUM ('Draft', 'Submitted', 'PendingSubstitute', 'PendingManager', 'PendingHr', 'Approved', 'Rejected', 'Cancelled');

-- CreateEnum
CREATE TYPE "RequestEventKind" AS ENUM ('Submitted', 'SubstituteAccepted', 'SubstituteDeclined', 'ManagerApproved', 'ManagerRejected', 'Returned', 'Resubmitted', 'HrConfirmed', 'HrRejected', 'Cancelled');

-- CreateTable
CREATE TABLE "Employee" (
    "id" UUID NOT NULL,
    "personalNo" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'Employee',
    "timeModel" "TimeModel" NOT NULL,
    "weeklyHours" DECIMAL(5,2) NOT NULL,
    "annualLeaveDays" DECIMAL(5,2) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "managerId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimeEntry" (
    "id" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "clockIn" TIMESTAMP(3) NOT NULL,
    "clockOut" TIMESTAMP(3),
    "source" "EntrySource" NOT NULL DEFAULT 'Manual',
    "status" "EntryStatus" NOT NULL DEFAULT 'Open',
    "requiresApproval" BOOLEAN NOT NULL DEFAULT false,
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "accuracyMeters" DECIMAL(7,2),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TimeEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Request" (
    "id" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "type" "RequestType" NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'Submitted',
    "workflowState" "WorkflowState" NOT NULL DEFAULT 'Submitted',
    "from" TIMESTAMP(3) NOT NULL,
    "to" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "requiresApproval" BOOLEAN NOT NULL DEFAULT false,
    "calculatedDays" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "substituteId" UUID,
    "substituteAcceptedAt" TIMESTAMP(3),
    "currentApproverId" UUID,
    "approverId" UUID,
    "hrConfirmedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequestEvent" (
    "id" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "kind" "RequestEventKind" NOT NULL,
    "actorId" UUID,
    "note" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RequestEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeLeaveAllowance" (
    "id" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "baseDays" DECIMAL(5,2) NOT NULL,
    "carryOverDays" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "carryOverExpiresOn" DATE,
    "adjustmentDays" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "adjustmentReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeLeaveAllowance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Employee_personalNo_key" ON "Employee"("personalNo");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_email_key" ON "Employee"("email");

-- CreateIndex
CREATE INDEX "Employee_role_idx" ON "Employee"("role");

-- CreateIndex
CREATE INDEX "Employee_managerId_idx" ON "Employee"("managerId");

-- CreateIndex
CREATE INDEX "TimeEntry_employeeId_clockIn_idx" ON "TimeEntry"("employeeId", "clockIn");

-- CreateIndex
CREATE INDEX "TimeEntry_status_idx" ON "TimeEntry"("status");

-- CreateIndex
CREATE INDEX "Request_employeeId_workflowState_idx" ON "Request"("employeeId", "workflowState");

-- CreateIndex
CREATE INDEX "Request_currentApproverId_idx" ON "Request"("currentApproverId");

-- CreateIndex
CREATE INDEX "Request_substituteId_idx" ON "Request"("substituteId");

-- CreateIndex
CREATE INDEX "RequestEvent_requestId_occurredAt_idx" ON "RequestEvent"("requestId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeLeaveAllowance_employeeId_year_key" ON "EmployeeLeaveAllowance"("employeeId", "year");

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Request" ADD CONSTRAINT "Request_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Request" ADD CONSTRAINT "Request_substituteId_fkey" FOREIGN KEY ("substituteId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Request" ADD CONSTRAINT "Request_currentApproverId_fkey" FOREIGN KEY ("currentApproverId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestEvent" ADD CONSTRAINT "RequestEvent_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestEvent" ADD CONSTRAINT "RequestEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeLeaveAllowance" ADD CONSTRAINT "EmployeeLeaveAllowance_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

