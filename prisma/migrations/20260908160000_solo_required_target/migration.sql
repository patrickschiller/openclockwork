-- A CHECK evaluates NULL as accepted; an enabled target must explicitly exist.
-- Tighten the invariant forward without rewriting the already applied migration.
ALTER TABLE "SoloPolicy" DROP CONSTRAINT "solo_valid_target";
ALTER TABLE "SoloPolicy" ADD CONSTRAINT "solo_valid_target"
  CHECK (NOT "targetEnabled" OR (
    "weeklyTargetMinutes" IS NOT NULL
    AND "weeklyTargetMinutes" > 0
    AND "weeklyTargetMinutes" <= 10080
  ));
