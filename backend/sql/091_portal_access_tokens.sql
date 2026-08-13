CREATE TABLE IF NOT EXISTS portal_access_tokens (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email        TEXT NOT NULL,
  token_hash   TEXT NOT NULL UNIQUE,
  expires_at   TIMESTAMPTZ NOT NULL,
  consumed_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_portal_access_tokens_email ON portal_access_tokens(email);
CREATE INDEX IF NOT EXISTS idx_portal_access_tokens_expires_at ON portal_access_tokens(expires_at);
