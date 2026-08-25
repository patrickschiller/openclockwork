-- Tablet terminal, separately authenticated kiosk devices, short-lived QR
-- challenges, geofence audit fields, and the installation-wide support prompt.

CREATE TABLE "Terminal" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "displayText" VARCHAR(500) NOT NULL,
    "locationLabel" VARCHAR(200) NOT NULL,
    "logoUrl" TEXT,
    "latitude" DECIMAL(9,6) NOT NULL,
    "longitude" DECIMAL(9,6) NOT NULL,
    "radiusMeters" INTEGER NOT NULL DEFAULT 100,
    "maxAccuracyMeters" INTEGER NOT NULL DEFAULT 100,
    "timeZone" VARCHAR(100) NOT NULL DEFAULT 'Europe/Berlin',
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "activatedAt" TIMESTAMP(3),
    "pairingCodeHash" CHAR(64),
    "pairingExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Terminal_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Terminal_latitude_range_chk" CHECK ("latitude" BETWEEN -90 AND 90),
    CONSTRAINT "Terminal_longitude_range_chk" CHECK ("longitude" BETWEEN -180 AND 180),
    CONSTRAINT "Terminal_radius_range_chk" CHECK ("radiusMeters" BETWEEN 10 AND 1000),
    CONSTRAINT "Terminal_accuracy_range_chk" CHECK ("maxAccuracyMeters" BETWEEN 5 AND 500),
    CONSTRAINT "Terminal_pairing_fields_chk" CHECK (
      ("pairingCodeHash" IS NULL AND "pairingExpiresAt" IS NULL)
      OR ("pairingCodeHash" IS NOT NULL AND "pairingExpiresAt" IS NOT NULL)
    )
);

CREATE TABLE "TerminalDevice" (
    "id" UUID NOT NULL,
    "terminalId" UUID NOT NULL,
    "name" VARCHAR(120),
    "tokenHash" CHAR(64) NOT NULL,
    "lastSeenAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TerminalDevice_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TerminalChallenge" (
    "id" UUID NOT NULL,
    "terminalId" UUID NOT NULL,
    "deviceId" UUID NOT NULL,
    "tokenHash" CHAR(64) NOT NULL,
    "rootDate" DATE NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TerminalChallenge_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TerminalChallengeRedemption" (
    "id" UUID NOT NULL,
    "challengeId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "timeEntryId" UUID NOT NULL,
    "action" VARCHAR(9) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TerminalChallengeRedemption_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "TerminalChallengeRedemption_action_chk" CHECK ("action" IN ('clock-in', 'clock-out'))
);

CREATE TABLE "TerminalSupportPrompt" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "firstActivatedAt" TIMESTAMP(3) NOT NULL,
    "shownAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TerminalSupportPrompt_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "TerminalSupportPrompt_singleton_chk" CHECK ("id" = 1),
    CONSTRAINT "TerminalSupportPrompt_time_order_chk" CHECK (
      "shownAt" IS NULL OR "shownAt" >= "firstActivatedAt"
    )
);

ALTER TABLE "TimeEntry"
    ADD COLUMN "terminalDistanceMeters" DECIMAL(8,2),
    ADD COLUMN "terminalRadiusMeters" INTEGER,
    ADD COLUMN "terminalMaxAccuracyMeters" INTEGER,
    ADD COLUMN "positionTimestamp" TIMESTAMP(3),
    ADD COLUMN "clockOutLatitude" DECIMAL(9,6),
    ADD COLUMN "clockOutLongitude" DECIMAL(9,6),
    ADD COLUMN "clockOutAccuracyMeters" DECIMAL(7,2),
    ADD COLUMN "clockOutTerminalDistanceMeters" DECIMAL(8,2),
    ADD COLUMN "clockOutTerminalRadiusMeters" INTEGER,
    ADD COLUMN "clockOutTerminalMaxAccuracyMeters" INTEGER,
    ADD COLUMN "clockOutPositionTimestamp" TIMESTAMP(3),
    ADD COLUMN "terminalId" UUID,
    ADD COLUMN "clockOutTerminalId" UUID,
    ADD COLUMN "clockInChallengeId" UUID,
    ADD COLUMN "clockOutChallengeId" UUID,
    ADD CONSTRAINT "TimeEntry_clockOutLatitude_range_chk"
      CHECK ("clockOutLatitude" IS NULL OR "clockOutLatitude" BETWEEN -90 AND 90),
    ADD CONSTRAINT "TimeEntry_clockOutLongitude_range_chk"
      CHECK ("clockOutLongitude" IS NULL OR "clockOutLongitude" BETWEEN -180 AND 180),
    ADD CONSTRAINT "TimeEntry_clockOutAccuracy_nonnegative_chk"
      CHECK ("clockOutAccuracyMeters" IS NULL OR "clockOutAccuracyMeters" >= 0),
    ADD CONSTRAINT "TimeEntry_terminalDistance_nonnegative_chk"
      CHECK ("terminalDistanceMeters" IS NULL OR "terminalDistanceMeters" >= 0),
    ADD CONSTRAINT "TimeEntry_terminalRadius_range_chk"
      CHECK ("terminalRadiusMeters" IS NULL OR "terminalRadiusMeters" BETWEEN 10 AND 1000),
    ADD CONSTRAINT "TimeEntry_terminalMaxAccuracy_range_chk"
      CHECK ("terminalMaxAccuracyMeters" IS NULL OR "terminalMaxAccuracyMeters" BETWEEN 5 AND 500),
    ADD CONSTRAINT "TimeEntry_clockOutTerminalDistance_nonnegative_chk"
      CHECK ("clockOutTerminalDistanceMeters" IS NULL OR "clockOutTerminalDistanceMeters" >= 0),
    ADD CONSTRAINT "TimeEntry_clockOutTerminalRadius_range_chk"
      CHECK ("clockOutTerminalRadiusMeters" IS NULL OR "clockOutTerminalRadiusMeters" BETWEEN 10 AND 1000),
    ADD CONSTRAINT "TimeEntry_clockOutTerminalMaxAccuracy_range_chk"
      CHECK ("clockOutTerminalMaxAccuracyMeters" IS NULL OR "clockOutTerminalMaxAccuracyMeters" BETWEEN 5 AND 500),
    ADD CONSTRAINT "TimeEntry_clockOut_coordinates_pair_chk"
      CHECK (("clockOutLatitude" IS NULL) = ("clockOutLongitude" IS NULL));

CREATE UNIQUE INDEX "Terminal_pairingCodeHash_key" ON "Terminal"("pairingCodeHash");
CREATE INDEX "Terminal_isActive_idx" ON "Terminal"("isActive");
CREATE UNIQUE INDEX "TerminalDevice_tokenHash_key" ON "TerminalDevice"("tokenHash");
CREATE INDEX "TerminalDevice_terminalId_revokedAt_idx" ON "TerminalDevice"("terminalId", "revokedAt");
CREATE UNIQUE INDEX "TerminalChallenge_tokenHash_key" ON "TerminalChallenge"("tokenHash");
CREATE INDEX "TerminalChallenge_terminalId_expiresAt_idx" ON "TerminalChallenge"("terminalId", "expiresAt");
CREATE INDEX "TerminalChallenge_deviceId_expiresAt_idx" ON "TerminalChallenge"("deviceId", "expiresAt");
CREATE INDEX "TerminalChallenge_deviceId_createdAt_idx" ON "TerminalChallenge"("deviceId", "createdAt");
CREATE UNIQUE INDEX "TerminalChallengeRedemption_challengeId_employeeId_key"
  ON "TerminalChallengeRedemption"("challengeId", "employeeId");
CREATE INDEX "TerminalChallengeRedemption_employeeId_createdAt_idx"
  ON "TerminalChallengeRedemption"("employeeId", "createdAt");
CREATE INDEX "TerminalChallengeRedemption_timeEntryId_idx"
  ON "TerminalChallengeRedemption"("timeEntryId");
CREATE INDEX "TimeEntry_clockInChallengeId_idx" ON "TimeEntry"("clockInChallengeId");
CREATE INDEX "TimeEntry_clockOutChallengeId_idx" ON "TimeEntry"("clockOutChallengeId");
CREATE INDEX "TimeEntry_terminalId_idx" ON "TimeEntry"("terminalId");
CREATE INDEX "TimeEntry_clockOutTerminalId_idx" ON "TimeEntry"("clockOutTerminalId");

ALTER TABLE "TerminalDevice"
    ADD CONSTRAINT "TerminalDevice_terminalId_fkey"
    FOREIGN KEY ("terminalId") REFERENCES "Terminal"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TerminalChallenge"
    ADD CONSTRAINT "TerminalChallenge_terminalId_fkey"
    FOREIGN KEY ("terminalId") REFERENCES "Terminal"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "TerminalChallenge_deviceId_fkey"
    FOREIGN KEY ("deviceId") REFERENCES "TerminalDevice"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TerminalChallengeRedemption"
    ADD CONSTRAINT "TerminalChallengeRedemption_challengeId_fkey"
    FOREIGN KEY ("challengeId") REFERENCES "TerminalChallenge"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "TerminalChallengeRedemption_employeeId_fkey"
    FOREIGN KEY ("employeeId") REFERENCES "Employee"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "TerminalChallengeRedemption_timeEntryId_fkey"
    FOREIGN KEY ("timeEntryId") REFERENCES "TimeEntry"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TimeEntry"
    ADD CONSTRAINT "TimeEntry_terminalId_fkey"
    FOREIGN KEY ("terminalId") REFERENCES "Terminal"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "TimeEntry_clockOutTerminalId_fkey"
    FOREIGN KEY ("clockOutTerminalId") REFERENCES "Terminal"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "TimeEntry_clockInChallengeId_fkey"
    FOREIGN KEY ("clockInChallengeId") REFERENCES "TerminalChallenge"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "TimeEntry_clockOutChallengeId_fkey"
    FOREIGN KEY ("clockOutChallengeId") REFERENCES "TerminalChallenge"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
