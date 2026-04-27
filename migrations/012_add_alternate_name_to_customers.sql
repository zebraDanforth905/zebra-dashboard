-- Staff-fillable alternate parent name for families with two parents.
-- Non-breaking: existing rows receive NULL; populated manually in link management.
ALTER TABLE customers ADD COLUMN IF NOT EXISTS alternate_name TEXT;
