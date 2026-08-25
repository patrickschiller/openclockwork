-- Permit an HR administrator to permanently remove a terminal and its
-- kiosk-only credentials/challenges without deleting historical TimeEntry
-- records. The scalar location/radius audit snapshots on TimeEntry remain;
-- only references to the deleted terminal challenges are cleared.

ALTER TABLE "TimeEntry"
    DROP CONSTRAINT "TimeEntry_terminalId_fkey",
    DROP CONSTRAINT "TimeEntry_clockOutTerminalId_fkey",
    DROP CONSTRAINT "TimeEntry_clockInChallengeId_fkey",
    DROP CONSTRAINT "TimeEntry_clockOutChallengeId_fkey";

ALTER TABLE "TerminalChallenge"
    DROP CONSTRAINT "TerminalChallenge_terminalId_fkey",
    DROP CONSTRAINT "TerminalChallenge_deviceId_fkey";

ALTER TABLE "TerminalChallengeRedemption"
    DROP CONSTRAINT "TerminalChallengeRedemption_challengeId_fkey";

ALTER TABLE "TimeEntry"
    ADD CONSTRAINT "TimeEntry_terminalId_fkey"
    FOREIGN KEY ("terminalId") REFERENCES "Terminal"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
    ADD CONSTRAINT "TimeEntry_clockOutTerminalId_fkey"
    FOREIGN KEY ("clockOutTerminalId") REFERENCES "Terminal"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
    ADD CONSTRAINT "TimeEntry_clockInChallengeId_fkey"
    FOREIGN KEY ("clockInChallengeId") REFERENCES "TerminalChallenge"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
    ADD CONSTRAINT "TimeEntry_clockOutChallengeId_fkey"
    FOREIGN KEY ("clockOutChallengeId") REFERENCES "TerminalChallenge"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TerminalChallenge"
    ADD CONSTRAINT "TerminalChallenge_terminalId_fkey"
    FOREIGN KEY ("terminalId") REFERENCES "Terminal"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "TerminalChallenge_deviceId_fkey"
    FOREIGN KEY ("deviceId") REFERENCES "TerminalDevice"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TerminalChallengeRedemption"
    ADD CONSTRAINT "TerminalChallengeRedemption_challengeId_fkey"
    FOREIGN KEY ("challengeId") REFERENCES "TerminalChallenge"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
