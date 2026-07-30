CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS engage_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  core_contact_id UUID NULL,
  name TEXT NOT NULL,
  email TEXT NULL,
  phone TEXT NULL,
  document TEXT NULL,
  status TEXT NOT NULL DEFAULT 'new',
  score INTEGER NOT NULL DEFAULT 0,
  last_contact_at TIMESTAMPTZ NULL,
  next_action_at TIMESTAMPTZ NULL,
  opt_out_at TIMESTAMPTZ NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS engage_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  color TEXT NOT NULL DEFAULT '#2563eb',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS engage_contact_tags (
  contact_id UUID NOT NULL REFERENCES engage_contacts(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES engage_tags(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (contact_id, tag_id)
);

CREATE TABLE IF NOT EXISTS engage_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT NULL,
  rule_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS engage_providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  channel TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ativo',
  config_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS engage_sender_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES engage_providers(id) ON DELETE RESTRICT,
  label TEXT NOT NULL,
  phone_number TEXT NULL,
  channel TEXT NOT NULL,
  daily_limit INTEGER NOT NULL DEFAULT 0,
  hourly_limit INTEGER NOT NULL DEFAULT 0,
  priority INTEGER NOT NULL DEFAULT 100,
  risk_score INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'ativo',
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS engage_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NULL REFERENCES engage_providers(id) ON DELETE SET NULL,
  channel TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT NULL,
  subject TEXT NULL,
  body TEXT NOT NULL,
  variables_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  approval_status TEXT NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS engage_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  channel TEXT NOT NULL,
  segment_id UUID NULL REFERENCES engage_segments(id) ON DELETE SET NULL,
  template_id UUID NULL REFERENCES engage_templates(id) ON DELETE SET NULL,
  sender_account_id UUID NULL REFERENCES engage_sender_accounts(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  scheduled_at TIMESTAMPTZ NULL,
  created_by UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS engage_campaign_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES engage_campaigns(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES engage_contacts(id) ON DELETE CASCADE,
  provider_id UUID NULL REFERENCES engage_providers(id) ON DELETE SET NULL,
  sender_account_id UUID NULL REFERENCES engage_sender_accounts(id) ON DELETE SET NULL,
  provider_message_id TEXT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  sent_at TIMESTAMPTZ NULL,
  delivered_at TIMESTAMPTZ NULL,
  read_at TIMESTAMPTZ NULL,
  clicked_at TIMESTAMPTZ NULL,
  replied_at TIMESTAMPTZ NULL,
  failed_at TIMESTAMPTZ NULL,
  failure_reason TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS engage_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES engage_contacts(id) ON DELETE CASCADE,
  channel TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  assigned_to UUID NULL,
  last_message_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS engage_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES engage_conversations(id) ON DELETE CASCADE,
  direction TEXT NOT NULL,
  channel TEXT NOT NULL,
  provider_message_id TEXT NULL,
  body TEXT NOT NULL,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'created',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS engage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NULL REFERENCES engage_contacts(id) ON DELETE SET NULL,
  campaign_id UUID NULL REFERENCES engage_campaigns(id) ON DELETE SET NULL,
  conversation_id UUID NULL REFERENCES engage_conversations(id) ON DELETE SET NULL,
  message_id UUID NULL REFERENCES engage_messages(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  provider_id UUID NULL REFERENCES engage_providers(id) ON DELETE SET NULL,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS engage_automation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  trigger_event TEXT NOT NULL,
  conditions_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  actions_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  priority INTEGER NOT NULL DEFAULT 100,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS engage_automation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID NULL REFERENCES engage_automation_rules(id) ON DELETE SET NULL,
  contact_id UUID NULL REFERENCES engage_contacts(id) ON DELETE SET NULL,
  campaign_id UUID NULL REFERENCES engage_campaigns(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  action_taken TEXT NOT NULL,
  before_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  after_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS engage_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NULL REFERENCES engage_contacts(id) ON DELETE SET NULL,
  campaign_id UUID NULL REFERENCES engage_campaigns(id) ON DELETE SET NULL,
  conversation_id UUID NULL REFERENCES engage_conversations(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  due_at TIMESTAMPTZ NULL,
  assigned_to UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_engage_contacts_status ON engage_contacts (status);
CREATE INDEX IF NOT EXISTS idx_engage_contacts_phone ON engage_contacts (phone);
CREATE INDEX IF NOT EXISTS idx_engage_campaigns_status ON engage_campaigns (status);
CREATE INDEX IF NOT EXISTS idx_engage_messages_conversation ON engage_messages (conversation_id);
CREATE INDEX IF NOT EXISTS idx_engage_messages_created_at ON engage_messages (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_engage_events_event_type ON engage_events (event_type);
CREATE INDEX IF NOT EXISTS idx_engage_events_created_at ON engage_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_engage_tasks_due_at ON engage_tasks (due_at);
