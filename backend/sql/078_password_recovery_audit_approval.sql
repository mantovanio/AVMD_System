alter table if exists password_recovery_audit
  add column if not exists approved_by_profile_id uuid null references profiles(id) on delete set null,
  add column if not exists approved_at timestamptz null,
  add column if not exists decision_note text null;

create index if not exists idx_password_recovery_audit_approved_by on password_recovery_audit(approved_by_profile_id, approved_at desc);
