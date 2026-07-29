-- Migration: 0002_rename_columns
-- 1. Ensures the extractos column is named subido_por (renames cargado_por if needed).
-- 2. Ensures subido_en exists with a DEFAULT '' so inserts that omit it don't fail.
--
-- All branches are guarded so this migration is safe to re-run.

DO $body$
BEGIN
  -- ── subido_por / cargado_por ──────────────────────────────────────────────

  -- Case A: cargado_por exists, subido_por does not → rename
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'extractos' AND column_name = 'cargado_por'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'extractos' AND column_name = 'subido_por'
  ) THEN
    ALTER TABLE "extractos" RENAME COLUMN "cargado_por" TO "subido_por";

  -- Case B: neither column exists → add subido_por
  ELSIF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'extractos' AND column_name = 'subido_por'
  ) THEN
    ALTER TABLE "extractos" ADD COLUMN "subido_por" text NOT NULL DEFAULT '';

  -- Case C: both exist → migrate data then drop cargado_por
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'extractos' AND column_name = 'cargado_por'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'extractos' AND column_name = 'subido_por'
  ) THEN
    UPDATE "extractos" SET "subido_por" = "cargado_por" WHERE "subido_por" = '';
    ALTER TABLE "extractos" DROP COLUMN "cargado_por";
  END IF;

  -- ── subido_en ─────────────────────────────────────────────────────────────
  -- This column was added manually to the live DB (NOT NULL, no default).
  -- Add it if missing, and ensure it has a DEFAULT so inserts without it work.

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'extractos' AND column_name = 'subido_en'
  ) THEN
    ALTER TABLE "extractos" ADD COLUMN "subido_en" text NOT NULL DEFAULT '';
  ELSE
    -- Column exists but may lack a DEFAULT — set one so inserts don't fail
    ALTER TABLE "extractos" ALTER COLUMN "subido_en" SET DEFAULT '';
    -- Back-fill any NULL or empty values with creado_en
    UPDATE "extractos" SET "subido_en" = COALESCE(NULLIF("subido_en", ''), "creado_en", '') WHERE "subido_en" IS NULL OR "subido_en" = '';
  END IF;
END
$body$;
