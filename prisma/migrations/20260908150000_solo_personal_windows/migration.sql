ALTER TABLE "SoloPolicy"
  ADD COLUMN "frameStart" VARCHAR(5) NOT NULL DEFAULT '00:00',
  ADD COLUMN "frameEnd" VARCHAR(5) NOT NULL DEFAULT '23:59',
  ADD COLUMN "coreTimes" JSONB NOT NULL DEFAULT '[]';

ALTER TABLE "SoloPolicy"
  ADD CONSTRAINT "SoloPolicy_frame_valid"
    CHECK ("frameStart" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      AND "frameEnd" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      AND "frameStart" < "frameEnd"),
  ADD CONSTRAINT "SoloPolicy_core_times_array"
    CHECK (jsonb_typeof("coreTimes") = 'array');
