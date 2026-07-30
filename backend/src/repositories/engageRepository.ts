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
}
