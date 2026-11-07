-- Additive audit evidence; no invented historical proxy actors/actions.
CREATE TABLE "TeamProxyAudit" (
  "id" UUID NOT NULL,
  "actorId" UUID,
  "employeeId" UUID NOT NULL,
  "resourceKind" TEXT NOT NULL,
  "resourceId" UUID NOT NULL,
  "action" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "values" JSONB NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TeamProxyAudit_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TeamProxyAudit_resource_kind" CHECK ("resourceKind" IN ('TimeEntry','Request','Absence')),
  CONSTRAINT "TeamProxyAudit_reason" CHECK (length(btrim("reason")) BETWEEN 5 AND 1000)
);
CREATE INDEX "TeamProxyAudit_employeeId_occurredAt_idx" ON "TeamProxyAudit"("employeeId", "occurredAt");
CREATE INDEX "TeamProxyAudit_resourceKind_resourceId_idx" ON "TeamProxyAudit"("resourceKind", "resourceId");
ALTER TABLE "TeamProxyAudit" ADD CONSTRAINT "TeamProxyAudit_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TeamProxyAudit" ADD CONSTRAINT "TeamProxyAudit_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
