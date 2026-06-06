-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "bundesland" VARCHAR(2) NOT NULL DEFAULT 'NW';

-- AlterTable
ALTER TABLE "WorkSchedule" ADD COLUMN     "workingDays" INTEGER NOT NULL DEFAULT 31;
