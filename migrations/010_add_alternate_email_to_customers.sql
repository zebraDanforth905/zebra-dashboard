-- Staff-fillable alternate contact email for families where both parents want the summer link.
-- Non-breaking: existing rows receive NULL; populated manually before the CC import.
ALTER TABLE customers ADD COLUMN IF NOT EXISTS alternate_email TEXT;
