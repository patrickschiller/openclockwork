-- CreateEnum
CREATE TYPE "ThemePreference" AS ENUM ('Light', 'Dark', 'System');

-- AlterTable
ALTER TABLE "Employee" ADD COLUMN "themePreference" "ThemePreference" NOT NULL DEFAULT 'System';
