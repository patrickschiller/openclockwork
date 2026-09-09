-- Effective policy versions retain explicit annual leave adjustments.
ALTER TABLE "SoloPolicy"
  ADD COLUMN "carryOverDays" DECIMAL(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN "carryOverExpiresOn" DATE,
  ADD COLUMN "leaveAdjustmentDays" DECIMAL(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN "leaveAdjustmentReason" TEXT,
  ADD COLUMN "leaveAllowanceYear" INTEGER;
