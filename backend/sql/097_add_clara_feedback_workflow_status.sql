ALTER TABLE clara_response_feedback
  ADD COLUMN IF NOT EXISTS review_status TEXT NOT NULL DEFAULT 'pendente',
  ADD COLUMN IF NOT EXISTS applied_rule TEXT NULL,
  ADD COLUMN IF NOT EXISTS applied_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS ignored_at TIMESTAMPTZ NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'clara_response_feedback_review_status_check'
  ) THEN
    ALTER TABLE clara_response_feedback
      ADD CONSTRAINT clara_response_feedback_review_status_check
      CHECK (review_status IN ('pendente', 'aplicada', 'ignorada'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_clara_response_feedback_review_status
  ON clara_response_feedback(review_status, created_at DESC);
