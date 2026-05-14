-- Migration 016: Clear bridge-inferred alternate_name values.
--
-- The portal API does not provide the alternate parent's name — only their email.
-- Prior versions of syncCustomers inferred alternate_name by writing the co-parent's
-- customer row name onto each other's row (the "bidirectional bridge").
-- This produced incorrect data: wrong spellings, self-references, and fake co-parents.
--
-- This migration clears alternate_name where it exactly matches another customer's
-- primary name (case-insensitive, trimmed) — the definitive signature of a bridge-inferred
-- value. Manually-entered alternate_names that don't match any other customer's name
-- are left untouched.
--
-- After this migration, alternate_name is staff-managed only. Portal sync no longer writes it.

UPDATE customers c
SET alternate_name = NULL
WHERE alternate_name IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM customers other
    WHERE other.id != c.id
      AND lower(trim(other.name)) = lower(trim(c.alternate_name))
  );
