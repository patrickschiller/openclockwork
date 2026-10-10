BEGIN;

-- Preserve existing employee calendars and historical time calculations.
ALTER TABLE "Employee" ADD COLUMN "holidayCalendar" VARCHAR(20) NOT NULL DEFAULT 'NONE',
  ADD COLUMN "holidayDates" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
UPDATE "Employee" SET "holidayCalendar" = CASE
  WHEN "bundesland" IN ('BW', 'BY', 'BE', 'BB', 'HB', 'HH', 'HE', 'MV', 'NI', 'NW', 'RP', 'SL', 'SN', 'ST', 'SH', 'TH')
    THEN 'DE-' || "bundesland"
  ELSE 'DE-NW' -- Preserve the previous resolver's fallback for invalid legacy data.
END;
ALTER TABLE "Employee" ALTER COLUMN "bundesland" DROP NOT NULL,
  ALTER COLUMN "bundesland" DROP DEFAULT;

ALTER TABLE "WorkSchedule" ADD COLUMN "breakRules" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "TimeEntry" ADD COLUMN "breakRules" JSONB NOT NULL DEFAULT '[]';
UPDATE "WorkSchedule" SET "breakRules" = '[{"afterMinutes":360,"breakMinutes":30},{"afterMinutes":540,"breakMinutes":45}]';
UPDATE "TimeEntry" SET "breakRules" = '[{"afterMinutes":360,"breakMinutes":30},{"afterMinutes":540,"breakMinutes":45}]';

-- Existing employees who used the implicit schedule keep their policy.
-- Do not create a default policy on empty/new installations.
DO $$
DECLARE legacy_id UUID := gen_random_uuid();
BEGIN
  IF EXISTS (SELECT 1 FROM "Employee" WHERE "workScheduleId" IS NULL)
     AND NOT EXISTS (SELECT 1 FROM "WorkSchedule" WHERE "isDefault" = TRUE) THEN
    INSERT INTO "WorkSchedule" ("id", "name", "description", "frameStart", "frameEnd", "workingDays", "breakRules", "updatedAt")
    VALUES (legacy_id, 'Migrated policy ' || legacy_id::TEXT, 'Preserved pre-internationalization working-time policy', '07:00', '23:00', 31,
      '[{"afterMinutes":360,"breakMinutes":30},{"afterMinutes":540,"breakMinutes":45}]', CURRENT_TIMESTAMP);
    UPDATE "Employee" SET "workScheduleId" = legacy_id WHERE "workScheduleId" IS NULL;
  END IF;
END $$;

-- Existing terminals retain their stored timezone.
ALTER TABLE "Terminal" ALTER COLUMN "timeZone" SET DEFAULT 'UTC';

COMMIT;
