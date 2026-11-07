-- Null target retains existing missing-booking requests, without fabricating
-- a previous revision or snapshot for historical records.
ALTER TABLE "Request"
  ADD COLUMN "targetTimeEntryId" UUID,
  ADD COLUMN "expectedTargetRevision" INTEGER,
  ADD COLUMN "targetTimeEntryBefore" JSONB;
ALTER TABLE "Request" ADD CONSTRAINT "Request_targetTimeEntryId_fkey"
  FOREIGN KEY ("targetTimeEntryId") REFERENCES "TimeEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Request" ADD CONSTRAINT "Request_correction_target_complete"
  CHECK (
    ("targetTimeEntryId" IS NULL AND "expectedTargetRevision" IS NULL AND "targetTimeEntryBefore" IS NULL)
    OR ("type" = 'TimeAdjustment' AND "targetTimeEntryId" IS NOT NULL
      AND "expectedTargetRevision" IS NOT NULL AND "expectedTargetRevision" >= 0 AND "targetTimeEntryBefore" IS NOT NULL)
  );
ALTER TABLE "TimeEntryAudit" ADD COLUMN "requestId" UUID;
ALTER TABLE "TimeEntryAudit" ADD CONSTRAINT "TimeEntryAudit_requestId_fkey"
  FOREIGN KEY ("requestId") REFERENCES "Request"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "TimeEntryAudit_requestId_idx" ON "TimeEntryAudit"("requestId");
