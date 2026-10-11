-- Increment A: QR/PIN only. Existing installations remain QR-only.
ALTER TABLE "Terminal" ADD COLUMN "allowedAuthMethods" TEXT[] NOT NULL DEFAULT ARRAY['QR']::TEXT[],
 ADD COLUMN "authConfigVersion" INTEGER NOT NULL DEFAULT 0,
 ADD CONSTRAINT "Terminal_auth_methods_chk" CHECK ("allowedAuthMethods" <@ ARRAY['QR','PIN']::TEXT[] AND (NOT "isActive" OR cardinality("allowedAuthMethods") > 0)),
 ADD CONSTRAINT "Terminal_auth_version_chk" CHECK ("authConfigVersion" >= 0);
ALTER TABLE "TerminalChallenge" ADD COLUMN "purpose" VARCHAR(20) NOT NULL DEFAULT 'DisplayQr',
 ADD COLUMN "authConfigVersion" INTEGER NOT NULL DEFAULT 0,
 ADD CONSTRAINT "TerminalChallenge_purpose_chk" CHECK ("purpose" IN ('DisplayQr','KioskIdentify'));
CREATE TABLE "TerminalCredential" (
 "id" UUID PRIMARY KEY, "employeeId" UUID NOT NULL UNIQUE REFERENCES "Employee"("id") ON DELETE RESTRICT,
 "method" VARCHAR(8) NOT NULL DEFAULT 'PIN' CHECK ("method" = 'PIN'),
 "pinHash" TEXT NOT NULL, "pepperVersion" VARCHAR(40) NOT NULL,
 "version" INTEGER NOT NULL DEFAULT 1 CHECK ("version" > 0), "revokedAt" TIMESTAMP(3),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE TABLE "TerminalAuthAttemptState" (
 "key" VARCHAR(160) PRIMARY KEY, "counter" INTEGER NOT NULL DEFAULT 0 CHECK ("counter" >= 0),
 "windowStartedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "lockedUntil" TIMESTAMP(3), "expiresAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "TerminalAuthAttemptState_expiresAt_idx" ON "TerminalAuthAttemptState"("expiresAt");
CREATE TABLE "TerminalBookingGrant" (
 "id" UUID PRIMARY KEY, "tokenHash" CHAR(64) NOT NULL UNIQUE,
 "employeeId" UUID NOT NULL, "credentialId" UUID NOT NULL, "credentialVersion" INTEGER NOT NULL,
 "terminalId" UUID NOT NULL, "deviceId" UUID NOT NULL, "challengeId" UUID NOT NULL,
 "authConfigVersion" INTEGER NOT NULL, "expiresAt" TIMESTAMP(3) NOT NULL, "consumedAt" TIMESTAMP(3),
 "action" VARCHAR(9), "timeEntryId" UUID, "bookedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "TerminalBookingGrant_consumption_chk" CHECK (
 ("consumedAt" IS NULL AND "action" IS NULL AND "timeEntryId" IS NULL AND "bookedAt" IS NULL)
 OR ("consumedAt" IS NOT NULL AND "action" IN ('clock-in','clock-out') AND "timeEntryId" IS NOT NULL AND "bookedAt" IS NOT NULL))
);
CREATE INDEX "TerminalBookingGrant_expiresAt_idx" ON "TerminalBookingGrant"("expiresAt");
CREATE INDEX "TerminalBookingGrant_deviceId_createdAt_idx" ON "TerminalBookingGrant"("deviceId","createdAt");
CREATE TABLE "TerminalAuditEvent" (
 "sequence" BIGINT PRIMARY KEY CHECK ("sequence" > 0), "id" UUID NOT NULL UNIQUE, "occurredAt" TIMESTAMP(3) NOT NULL,
 "event" VARCHAR(60) NOT NULL, "result" VARCHAR(60) NOT NULL, "method" VARCHAR(8), "action" VARCHAR(9),
 "employeeId" UUID, "actorId" UUID, "terminalId" UUID, "deviceId" UUID, "terminalName" VARCHAR(120),
 "locationLabel" VARCHAR(200), "timeEntryId" UUID, "canonicalPayload" TEXT NOT NULL,
 "previousHash" CHAR(64) NOT NULL, "hash" CHAR(64) NOT NULL, "keyVersion" VARCHAR(40) NOT NULL
);
CREATE INDEX "TerminalAuditEvent_terminalId_occurredAt_idx" ON "TerminalAuditEvent"("terminalId","occurredAt");
CREATE INDEX "TerminalAuditEvent_employeeId_occurredAt_idx" ON "TerminalAuditEvent"("employeeId","occurredAt");
CREATE INDEX "TerminalAuditEvent_occurredAt_idx" ON "TerminalAuditEvent"("occurredAt");
-- This protects against accidental mutations, not database owners. Operators must
-- also use a separate runtime role with SELECT/INSERT only and external anchors.
CREATE FUNCTION terminal_audit_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Terminal audit events are append-only'; END $$;
CREATE TRIGGER "TerminalAuditEvent_append_only" BEFORE UPDATE OR DELETE ON "TerminalAuditEvent"
FOR EACH ROW EXECUTE FUNCTION terminal_audit_append_only();
