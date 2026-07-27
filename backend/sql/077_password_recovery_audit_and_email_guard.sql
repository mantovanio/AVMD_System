create table if not exists password_recovery_audit (
  id bigserial primary key,
  profile_id uuid null references profiles(id) on delete set null,
  email text not null,
  action text not null,
  status text not null,
  reason text null,
  source text null,
  ip_address text null,
  user_agent text null,
  clerk_user_id text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_password_recovery_audit_profile_id on password_recovery_audit(profile_id, created_at desc);
create index if not exists idx_password_recovery_audit_email on password_recovery_audit(email, created_at desc);
create index if not exists idx_password_recovery_audit_action on password_recovery_audit(action, created_at desc);
