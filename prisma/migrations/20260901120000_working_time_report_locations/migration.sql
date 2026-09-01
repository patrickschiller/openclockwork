-- Preserve the human-readable terminal location with each physical booking.
-- This keeps working-time reports stable when a terminal is renamed or removed.

ALTER TABLE "TimeEntry"
    ADD COLUMN "terminalLocationLabel" VARCHAR(200),
    ADD COLUMN "clockOutTerminalLocationLabel" VARCHAR(200);

UPDATE "TimeEntry" AS entry
SET "terminalLocationLabel" = terminal."locationLabel"
FROM "Terminal" AS terminal
WHERE entry."terminalId" = terminal."id";

UPDATE "TimeEntry" AS entry
SET "clockOutTerminalLocationLabel" = terminal."locationLabel"
FROM "Terminal" AS terminal
WHERE entry."clockOutTerminalId" = terminal."id";
