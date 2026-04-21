-- Generalized parent self-serve system.
-- 'summer' is the first request_type; restart/other will reuse this schema.
-- NOTE: students.id is NUMERIC in this DB (portal ID).

-- One token per customer (family). Reused across all future flows.
CREATE TABLE parent_tokens (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id      UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  token            TEXT NOT NULL UNIQUE,
  email_sent_at    TIMESTAMPTZ,
  email_sent_count INTEGER NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(customer_id)
);

CREATE INDEX idx_parent_tokens_token       ON parent_tokens(token);
CREATE INDEX idx_parent_tokens_customer_id ON parent_tokens(customer_id);

-- Generalized parent request. One row per submission.
-- Multiple rows per student are possible (resubmission); use is_latest to find current.
CREATE TABLE parent_requests (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_id      UUID NOT NULL REFERENCES parent_tokens(id) ON DELETE CASCADE,
  student_id    NUMERIC NOT NULL,   -- matches students.id (NUMERIC, cast to text in TS)
  request_type  TEXT NOT NULL CHECK (request_type IN ('summer_scheduling', 'restart', 'other')),
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'reviewed', 'completed', 'superseded', 'needs_manual_followup')),
  is_latest     BOOLEAN NOT NULL DEFAULT TRUE,  -- only one TRUE per (student_id, request_type)
  payload       JSONB NOT NULL DEFAULT '{}',    -- request-type-specific structured data
  custom_notes  TEXT,                           -- free text for "Other" or extra context
  enrolment_ids UUID[] NOT NULL DEFAULT '{}',  -- set when approved; one per session enrolled
  submitted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at   TIMESTAMPTZ,
  reviewed_by   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_parent_requests_token_id     ON parent_requests(token_id);
CREATE INDEX idx_parent_requests_student_id   ON parent_requests(student_id);
CREATE INDEX idx_parent_requests_status       ON parent_requests(status);
CREATE INDEX idx_parent_requests_request_type ON parent_requests(request_type);
-- Partial index for efficient "latest" lookups
CREATE INDEX idx_parent_requests_latest
  ON parent_requests(student_id, request_type)
  WHERE is_latest = TRUE;
