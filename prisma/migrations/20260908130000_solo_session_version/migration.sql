-- Password changes invalidate existing sessions, including refresh tokens.
ALTER TABLE "Employee" ADD COLUMN "authVersion" INTEGER NOT NULL DEFAULT 0;
