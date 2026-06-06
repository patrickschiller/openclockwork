-- CreateEnum
CREATE TYPE "AbsenceKind" AS ENUM ('Sickness');

-- CreateTable
CREATE TABLE "Absence" (
    "id" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "kind" "AbsenceKind" NOT NULL DEFAULT 'Sickness',
    "from" DATE NOT NULL,
    "to" DATE NOT NULL,
    "certified" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Absence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Absence_employeeId_from_idx" ON "Absence"("employeeId", "from");

-- CreateIndex
CREATE INDEX "Absence_kind_from_idx" ON "Absence"("kind", "from");

-- AddForeignKey
ALTER TABLE "Absence" ADD CONSTRAINT "Absence_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
