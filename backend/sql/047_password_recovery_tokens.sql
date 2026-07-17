CREATE TABLE IF NOT EXISTS password_recovery_tokens (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id   UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  email        TEXT NOT NULL,
  token_hash   TEXT NOT NULL UNIQUE,
  expires_at   TIMESTAMPTZ NOT NULL,
  consumed_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_password_recovery_tokens_profile_id ON password_recovery_tokens(profile_id);
CREATE INDEX IF NOT EXISTS idx_password_recovery_tokens_expires_at ON password_recovery_tokens(expires_at);
