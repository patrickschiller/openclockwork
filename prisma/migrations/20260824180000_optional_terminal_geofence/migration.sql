-- Terminals may deliberately operate without collecting employee GPS data.
-- Existing terminals retain their location-bound behavior.
ALTER TABLE "Terminal"
ADD COLUMN "enforceGeofence" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "Terminal"
ALTER COLUMN "latitude" DROP NOT NULL,
ALTER COLUMN "longitude" DROP NOT NULL,
ALTER COLUMN "radiusMeters" DROP NOT NULL,
ALTER COLUMN "radiusMeters" DROP DEFAULT,
ALTER COLUMN "maxAccuracyMeters" DROP NOT NULL,
ALTER COLUMN "maxAccuracyMeters" DROP DEFAULT;

ALTER TABLE "Terminal"
ADD CONSTRAINT "Terminal_geofence_configuration_chk" CHECK (
    (
        "enforceGeofence" = true
        AND "latitude" IS NOT NULL
        AND "longitude" IS NOT NULL
        AND "radiusMeters" IS NOT NULL
        AND "maxAccuracyMeters" IS NOT NULL
    )
    OR (
        "enforceGeofence" = false
        AND "latitude" IS NULL
        AND "longitude" IS NULL
        AND "radiusMeters" IS NULL
        AND "maxAccuracyMeters" IS NULL
    )
);
