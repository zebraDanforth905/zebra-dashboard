-- Manual deployment required.
-- Store Canvas API tokens per dashboard user.

CREATE TABLE IF NOT EXISTS user_canvas_api_tokens (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  token_value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT NOW()
);
