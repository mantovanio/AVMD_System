import type { AivenSqlClient } from '../db/aivenClient.js'

export type EngageProviderRow = {
  id: string
  key: string
  name: string
  channel: string
  status: string
  config_json: Record<string, unknown>
  created_at: string
  updated_at: string
}

export type EngageSenderAccountRow = {
  id: string
  provider_id: string
  label: string
  phone_number: string | null
  channel: string
  daily_limit: number
  hourly_limit: number
  priority: number
  risk_score: number
  status: string
  metadata_json: Record<string, unknown>
  created_at: string
  updated_at: string
}

export type EngageCampaignRow = {
  id: string
  name: string
  channel: string
  segment_id: string | null
  template_id: string | null
  sender_account_id: string | null
  status: string
  scheduled_at: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export type EngageTemplateRow = {
  id: string
  provider_id: string | null
  channel: string
  name: string
  category: string | null
  subject: string | null
  body: string
  variables_json: Record<string, unknown>
  approval_status: string
  created_at: string
  updated_at: string
}

export type EngageSegmentRow = {
  id: string
  name: string
  description: string | null
  rule_json: Record<string, unknown>
  is_active: boolean
  created_at: string
  updated_at: string
}

export type EngageContactRow = {
  id: string
  core_contact_id: string | null
  name: string
  email: string | null
  phone: string | null
  document: string | null
  status: string
  score: number
  last_contact_at: string | null
  next_action_at: string | null
  opt_out_at: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export type EngageSummaryRow = {
  contacts_active: number
  campaigns_active: number
  messages_sent: number
  replies_today: number
  opt_outs: number
  providers_active: number
  sender_accounts_active: number
  tasks_open: number
  events_today: number
}

export type CreateEngageContactInput = {
  core_contact_id?: string | null
  name: string
  email?: string | null
  phone?: string | null
  document?: string | null
  status?: string
  score?: number
  metadata?: Record<string, unknown>
}

export type CreateEngageCampaignInput = {
  name: string
  channel: string
  segment_id?: string | null
  template_id?: string | null
  sender_account_id?: string | null
  scheduled_at?: string | null
  created_by?: string | null
}

export type CreateEngageTemplateInput = {
  provider_id?: string | null
  channel: string
  name: string
  category?: string | null
  subject?: string | null
  body: string
  variables_json?: Record<string, unknown>
  approval_status?: string
}

export type CreateEngageSegmentInput = {
  name: string
  description?: string | null
  rule_json?: Record<string, unknown>
  is_active?: boolean
}

export type CreateEngageProviderInput = {
  key: string
  name: string
  channel: string
  status?: string
  config_json?: Record<string, unknown>
}

export type CreateEngageSenderAccountInput = {
  provider_id: string
  label: string
  phone_number?: string | null
  channel: string
  daily_limit?: number
  hourly_limit?: number
  priority?: number
  risk_score?: number
  status?: string
  metadata_json?: Record<string, unknown>
}

export type EngageEventRow = {
  id: string
  contact_id: string | null
  campaign_id: string | null
  conversation_id: string | null
  message_id: string | null
  event_type: string
  provider_id: string | null
  payload_json: Record<string, unknown>
  created_at: string
}

export type EngageTaskRow = {
  id: string
  contact_id: string | null
  campaign_id: string | null
  conversation_id: string | null
  title: string
  type: string
  status: string
  due_at: string | null
  assigned_to: string | null
  created_at: string
  updated_at: string
}

export type EngageCampaignMessageRow = {
  id: string
  campaign_id: string
  contact_id: string
  provider_id: string | null
  sender_account_id: string | null
  provider_message_id: string | null
  status: string
  sent_at: string | null
  delivered_at: string | null
  read_at: string | null
  clicked_at: string | null
  replied_at: string | null
  failed_at: string | null
  failure_reason: string | null
  created_at: string
  updated_at: string
}

export type EngageAutomationRuleRow = {
  id: string
  name: string
  trigger_event: string
  conditions_json: Record<string, unknown>
  actions_json: Record<string, unknown>
  priority: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export type CreateEngageAutomationRuleInput = {
  name: string
  trigger_event: string
  conditions_json?: Record<string, unknown>
  actions_json?: Record<string, unknown>
  priority?: number
  is_active?: boolean
}

export type EngageConversationRow = {
  id: string
  contact_id: string
  channel: string
  status: string
  assigned_to: string | null
  last_message_at: string | null
  created_at: string
  updated_at: string
}

export type EngageMessageRow = {
  id: string
  conversation_id: string
  direction: string
  channel: string
  provider_message_id: string | null
  body: string
  payload_json: Record<string, unknown>
  status: string
  created_at: string
}

export type CreateEngageEventInput = {
  contact_id?: string | null
  campaign_id?: string | null
  conversation_id?: string | null
  message_id?: string | null
  event_type: string
  provider_id?: string | null
  payload_json?: Record<string, unknown>
}

export type CreateEngageTaskInput = {
  contact_id?: string | null
  campaign_id?: string | null
  conversation_id?: string | null
  title: string
  type: string
  status?: string
  due_at?: string | null
  assigned_to?: string | null
}

export type CreateEngageConversationInput = {
  contact_id: string
  channel: string
  status?: string
  assigned_to?: string | null
  last_message_at?: string | null
}

export type CreateEngageMessageInput = {
  conversation_id: string
  direction: string
  channel: string
  provider_message_id?: string | null
  body: string
  payload_json?: Record<string, unknown>
  status?: string
}

export type QueueEngageDispatchInput = {
  campaign_id: string
  contact_id: string
  provider_id?: string | null
  sender_account_id?: string | null
  body: string
  channel: string
  payload_json?: Record<string, unknown>
}

export class EngageRepository {
  constructor(private readonly db: AivenSqlClient) {}

  async summary(): Promise<EngageSummaryRow> {
    const result = await this.db.query<EngageSummaryRow>(`
      SELECT
        (SELECT COUNT(*) FROM engage_contacts WHERE status <> 'opt_out')::int AS contacts_active,
        (SELECT COUNT(*) FROM engage_campaigns WHERE status IN ('draft','scheduled','sending','running','sent'))::int AS campaigns_active,
        (SELECT COUNT(*) FROM engage_campaign_messages WHERE status IN ('sent','delivered','read'))::int AS messages_sent,
        (SELECT COUNT(*) FROM engage_events WHERE event_type = 'message.replied' AND created_at >= NOW() - INTERVAL '1 day')::int AS replies_today,
        (SELECT COUNT(*) FROM engage_contacts WHERE status = 'opt_out')::int AS opt_outs,
        (SELECT COUNT(*) FROM engage_providers WHERE status = 'ativo')::int AS providers_active,
        (SELECT COUNT(*) FROM engage_sender_accounts WHERE status = 'ativo')::int AS sender_accounts_active,
        (SELECT COUNT(*) FROM engage_tasks WHERE status IN ('open','pending','waiting'))::int AS tasks_open,
        (SELECT COUNT(*) FROM engage_events WHERE created_at >= NOW() - INTERVAL '1 day')::int AS events_today
    `)
    return result.rows[0] ?? {
      contacts_active: 0,
      campaigns_active: 0,
      messages_sent: 0,
      replies_today: 0,
      opt_outs: 0,
      providers_active: 0,
      sender_accounts_active: 0,
      tasks_open: 0,
      events_today: 0,
    }
  }

  async listContacts(limit = 20): Promise<EngageContactRow[]> {
    const result = await this.db.query<EngageContactRow>(
      `SELECT * FROM engage_contacts ORDER BY created_at DESC LIMIT $1`,
      [limit],
    )
    return result.rows
  }

  async createContact(input: CreateEngageContactInput): Promise<EngageContactRow> {
    const result = await this.db.query<EngageContactRow>(
      `INSERT INTO engage_contacts
         (core_contact_id, name, email, phone, document, status, score, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING *`,
      [
        input.core_contact_id ?? null,
        input.name,
        input.email ?? null,
        input.phone ?? null,
        input.document ?? null,
        input.status ?? 'new',
        input.score ?? 0,
        JSON.stringify(input.metadata ?? {}),
      ],
    )
    return result.rows[0]
  }

  async listCampaigns(limit = 20): Promise<EngageCampaignRow[]> {
    const result = await this.db.query<EngageCampaignRow>(
      `SELECT * FROM engage_campaigns ORDER BY created_at DESC LIMIT $1`,
      [limit],
    )
    return result.rows
  }

  async createCampaign(input: CreateEngageCampaignInput): Promise<EngageCampaignRow> {
    const result = await this.db.query<EngageCampaignRow>(
      `INSERT INTO engage_campaigns
         (name, channel, segment_id, template_id, sender_account_id, scheduled_at, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING *`,
      [
        input.name,
        input.channel,
        input.segment_id ?? null,
        input.template_id ?? null,
        input.sender_account_id ?? null,
        input.scheduled_at ?? null,
        input.created_by ?? null,
      ],
    )
    return result.rows[0]
  }

  async listTemplates(limit = 20): Promise<EngageTemplateRow[]> {
    const result = await this.db.query<EngageTemplateRow>(
      `SELECT * FROM engage_templates ORDER BY created_at DESC LIMIT $1`,
      [limit],
    )
    return result.rows
  }

  async createTemplate(input: CreateEngageTemplateInput): Promise<EngageTemplateRow> {
    const result = await this.db.query<EngageTemplateRow>(
      `INSERT INTO engage_templates
         (provider_id, channel, name, category, subject, body, variables_json, approval_status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING *`,
      [
        input.provider_id ?? null,
        input.channel,
        input.name,
        input.category ?? null,
        input.subject ?? null,
        input.body,
        JSON.stringify(input.variables_json ?? {}),
        input.approval_status ?? 'draft',
      ],
    )
    return result.rows[0]
  }

  async listSegments(limit = 20): Promise<EngageSegmentRow[]> {
    const result = await this.db.query<EngageSegmentRow>(
      `SELECT * FROM engage_segments ORDER BY created_at DESC LIMIT $1`,
      [limit],
    )
    return result.rows
  }

  async createSegment(input: CreateEngageSegmentInput): Promise<EngageSegmentRow> {
    const result = await this.db.query<EngageSegmentRow>(
      `INSERT INTO engage_segments
         (name, description, rule_json, is_active)
       VALUES ($1,$2,$3,$4)
       RETURNING *`,
      [
        input.name,
        input.description ?? null,
        JSON.stringify(input.rule_json ?? {}),
        input.is_active ?? true,
      ],
    )
    return result.rows[0]
  }

  async listProviders(): Promise<EngageProviderRow[]> {
    const result = await this.db.query<EngageProviderRow>(
      `SELECT * FROM engage_providers ORDER BY created_at DESC`,
    )
    return result.rows
  }

  async createProvider(input: CreateEngageProviderInput): Promise<EngageProviderRow> {
    const result = await this.db.query<EngageProviderRow>(
      `INSERT INTO engage_providers
         (key, name, channel, status, config_json)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING *`,
      [
        input.key,
        input.name,
        input.channel,
        input.status ?? 'ativo',
        JSON.stringify(input.config_json ?? {}),
      ],
    )
    return result.rows[0]
  }

  async listSenderAccounts(): Promise<EngageSenderAccountRow[]> {
    const result = await this.db.query<EngageSenderAccountRow>(
      `SELECT * FROM engage_sender_accounts ORDER BY priority ASC, created_at DESC`,
    )
    return result.rows
  }

  async createSenderAccount(input: CreateEngageSenderAccountInput): Promise<EngageSenderAccountRow> {
    const result = await this.db.query<EngageSenderAccountRow>(
      `INSERT INTO engage_sender_accounts
         (provider_id, label, phone_number, channel, daily_limit, hourly_limit, priority, risk_score, status, metadata_json)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING *`,
      [
        input.provider_id,
        input.label,
        input.phone_number ?? null,
        input.channel,
        input.daily_limit ?? 0,
        input.hourly_limit ?? 0,
        input.priority ?? 100,
        input.risk_score ?? 0,
        input.status ?? 'ativo',
        JSON.stringify(input.metadata_json ?? {}),
      ],
    )
    return result.rows[0]
  }

  async listEvents(limit = 20): Promise<EngageEventRow[]> {
    const result = await this.db.query<EngageEventRow>(
      `SELECT * FROM engage_events ORDER BY created_at DESC LIMIT $1`,
      [limit],
    )
    return result.rows
  }

  async createEvent(input: CreateEngageEventInput): Promise<EngageEventRow> {
    const result = await this.db.query<EngageEventRow>(
      `INSERT INTO engage_events
         (contact_id, campaign_id, conversation_id, message_id, event_type, provider_id, payload_json)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING *`,
      [
        input.contact_id ?? null,
        input.campaign_id ?? null,
        input.conversation_id ?? null,
        input.message_id ?? null,
        input.event_type,
        input.provider_id ?? null,
        JSON.stringify(input.payload_json ?? {}),
      ],
    )
    return result.rows[0]
  }

  async listTasks(limit = 20): Promise<EngageTaskRow[]> {
    const result = await this.db.query<EngageTaskRow>(
      `SELECT * FROM engage_tasks ORDER BY created_at DESC LIMIT $1`,
      [limit],
    )
    return result.rows
  }

  async listCampaignMessages(limit = 50): Promise<EngageCampaignMessageRow[]> {
    const result = await this.db.query<EngageCampaignMessageRow>(
      `SELECT * FROM engage_campaign_messages ORDER BY created_at DESC LIMIT $1`,
      [limit],
    )
    return result.rows
  }

  async listAutomationRules(limit = 50): Promise<EngageAutomationRuleRow[]> {
    const result = await this.db.query<EngageAutomationRuleRow>(
      `SELECT * FROM engage_automation_rules ORDER BY priority ASC, created_at DESC LIMIT $1`,
      [limit],
    )
    return result.rows
  }

  async createAutomationRule(input: CreateEngageAutomationRuleInput): Promise<EngageAutomationRuleRow> {
    const result = await this.db.query<EngageAutomationRuleRow>(
      `INSERT INTO engage_automation_rules
         (name, trigger_event, conditions_json, actions_json, priority, is_active)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING *`,
      [
        input.name,
        input.trigger_event,
        JSON.stringify(input.conditions_json ?? {}),
        JSON.stringify(input.actions_json ?? {}),
        input.priority ?? 100,
        input.is_active ?? true,
      ],
    )
    return result.rows[0]
  }

  async createTask(input: CreateEngageTaskInput): Promise<EngageTaskRow> {
    const result = await this.db.query<EngageTaskRow>(
      `INSERT INTO engage_tasks
         (contact_id, campaign_id, conversation_id, title, type, status, due_at, assigned_to)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING *`,
      [
        input.contact_id ?? null,
        input.campaign_id ?? null,
        input.conversation_id ?? null,
        input.title,
        input.type,
        input.status ?? 'open',
        input.due_at ?? null,
        input.assigned_to ?? null,
      ],
    )
    return result.rows[0]
  }

  async queueDispatch(input: QueueEngageDispatchInput) {
    const campaignMessage = await this.db.query<{ id: string }>(
      `INSERT INTO engage_campaign_messages
         (campaign_id, contact_id, provider_id, sender_account_id, status, sent_at, created_at, updated_at)
       VALUES ($1,$2,$3,$4,'queued',NULL,NOW(),NOW())
       RETURNING id`,
      [
        input.campaign_id,
        input.contact_id,
        input.provider_id ?? null,
        input.sender_account_id ?? null,
      ],
    )

    const event = await this.createEvent({
      campaign_id: input.campaign_id,
      contact_id: input.contact_id,
      message_id: campaignMessage.rows[0]?.id ?? null,
      event_type: 'campaign.queued',
      provider_id: input.provider_id ?? null,
      payload_json: {
        body: input.body,
        channel: input.channel,
        sender_account_id: input.sender_account_id ?? null,
        ...input.payload_json,
      },
    })

    return {
      campaign_message_id: campaignMessage.rows[0]?.id ?? null,
      event_id: event?.id ?? null,
    }
  }

  async findConversationByContact(contactId: string, channel: string): Promise<EngageConversationRow | null> {
    const result = await this.db.query<EngageConversationRow>(
      `SELECT * FROM engage_conversations WHERE contact_id = $1 AND channel = $2 ORDER BY updated_at DESC LIMIT 1`,
      [contactId, channel],
    )
    return result.rows[0] ?? null
  }

  async createConversation(input: CreateEngageConversationInput): Promise<EngageConversationRow> {
    const result = await this.db.query<EngageConversationRow>(
      `INSERT INTO engage_conversations (contact_id, channel, status, assigned_to, last_message_at)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING *`,
      [
        input.contact_id,
        input.channel,
        input.status ?? 'open',
        input.assigned_to ?? null,
        input.last_message_at ?? null,
      ],
    )
    return result.rows[0]
  }

  async upsertConversation(input: CreateEngageConversationInput): Promise<EngageConversationRow> {
    const existing = await this.findConversationByContact(input.contact_id, input.channel)
    if (existing) {
      const updated = await this.db.query<EngageConversationRow>(
        `UPDATE engage_conversations
            SET status = COALESCE($2, status),
                assigned_to = COALESCE($3, assigned_to),
                last_message_at = COALESCE($4, last_message_at),
                updated_at = NOW()
          WHERE id = $1
          RETURNING *`,
        [existing.id, input.status ?? null, input.assigned_to ?? null, input.last_message_at ?? null],
      )
      return updated.rows[0]
    }
    return this.createConversation(input)
  }

  async listMessages(conversationId: string, limit = 50): Promise<EngageMessageRow[]> {
    const result = await this.db.query<EngageMessageRow>(
      `SELECT * FROM engage_messages WHERE conversation_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [conversationId, limit],
    )
    return result.rows
  }

  async createMessage(input: CreateEngageMessageInput): Promise<EngageMessageRow> {
    const result = await this.db.query<EngageMessageRow>(
      `INSERT INTO engage_messages
         (conversation_id, direction, channel, provider_message_id, body, payload_json, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING *`,
      [
        input.conversation_id,
        input.direction,
        input.channel,
        input.provider_message_id ?? null,
        input.body,
        JSON.stringify(input.payload_json ?? {}),
        input.status ?? 'created',
      ],
    )
    return result.rows[0]
  }
}
