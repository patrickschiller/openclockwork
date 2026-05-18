-- AlterTable
ALTER TABLE "Request" ADD COLUMN     "halfDayEnd" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "halfDayStart" BOOLEAN NOT NULL DEFAULT false;
