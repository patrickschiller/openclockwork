-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "workScheduleId" UUID;

-- CreateTable
CREATE TABLE "WorkSchedule" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "frameStart" TEXT NOT NULL,
    "frameEnd" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkScheduleCoreTime" (
    "id" UUID NOT NULL,
    "scheduleId" UUID NOT NULL,
    "label" TEXT,
    "start" TEXT NOT NULL,
    "end" TEXT NOT NULL,
    "weekdays" INTEGER NOT NULL DEFAULT 31,

    CONSTRAINT "WorkScheduleCoreTime_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkSchedule_name_key" ON "WorkSchedule"("name");

-- CreateIndex
CREATE INDEX "WorkScheduleCoreTime_scheduleId_idx" ON "WorkScheduleCoreTime"("scheduleId");

-- CreateIndex
CREATE INDEX "Employee_workScheduleId_idx" ON "Employee"("workScheduleId");

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_workScheduleId_fkey" FOREIGN KEY ("workScheduleId") REFERENCES "WorkSchedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkScheduleCoreTime" ADD CONSTRAINT "WorkScheduleCoreTime_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "WorkSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;
