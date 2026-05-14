-- Clear self-loop alternate_email and alternate_name from historical portal syncs.
-- The portal sometimes wrote the primary parent's own email/name into the alternate fields.
-- Our normalize.ts guard (added 2026-04-28) prevents new self-loops, but existing rows need cleanup.
--
-- Safe: only NULLs fields that are exact duplicates of the primary field.
-- No rows deleted. No billing tables touched.

-- Step 1: clear alternate_email where it equals the primary email (case-insensitive).
UPDATE customers
SET alternate_email = NULL
WHERE alternate_email IS NOT NULL
  AND lower(trim(alternate_email)) = lower(trim(email));

-- Step 2: clear alternate_name where it equals the primary name (case-insensitive, whitespace-normalized).
-- Handles both "Name = Name" rows and rows where a valid alternate_email exists
-- but the portal wrote the primary parent name instead of the second parent name.
UPDATE customers
SET alternate_name = NULL
WHERE alternate_name IS NOT NULL
  AND lower(trim(alternate_name)) = lower(trim(name));
