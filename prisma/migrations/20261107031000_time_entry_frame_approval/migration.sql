-- Existing pending Team entries intentionally keep NULL markers: they start
-- at manager review, never at HR or Approved. Historical Solo/in-frame entries
-- and their status, revision, timestamps and audit records remain unchanged.
ALTER TABLE "TimeEntry"
  ADD COLUMN "frameApprovedRevision" INTEGER,
  ADD COLUMN "frameApproverId" UUID;

ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_frameApproverId_fkey"
  FOREIGN KEY ("frameApproverId") REFERENCES "Employee"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
