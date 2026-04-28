-- Preserve response history when tokens are deleted.
-- Changes ON DELETE CASCADE → ON DELETE SET NULL so parent_requests rows
-- survive token deletion. token_id becomes nullable to allow this.
-- Staff can still delete tokens (e.g. to reissue clean links) without
-- losing any family's submission history.

ALTER TABLE parent_requests
  DROP CONSTRAINT parent_requests_token_id_fkey,
  ALTER COLUMN token_id DROP NOT NULL,
  ADD CONSTRAINT parent_requests_token_id_fkey
    FOREIGN KEY (token_id) REFERENCES parent_tokens(id) ON DELETE SET NULL;
