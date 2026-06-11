-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "planHours" DECIMAL(8,2);

-- AlterTable
ALTER TABLE "ServiceOrder" ADD COLUMN     "planHours" DECIMAL(8,2);

-- AlterTable
ALTER TABLE "TimeEntry" ADD COLUMN     "activity" TEXT,
ADD COLUMN     "serviceOrderId" UUID;

-- CreateIndex
CREATE INDEX "TimeEntry_serviceOrderId_idx" ON "TimeEntry"("serviceOrderId");

-- AddForeignKey
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_serviceOrderId_fkey" FOREIGN KEY ("serviceOrderId") REFERENCES "ServiceOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
