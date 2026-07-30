import type { IncomingMessage, ServerResponse } from 'node:http'
import type {
  CreateEngageEventInput,
  EngageRepository,
  CreateEngageCampaignInput,
  CreateEngageContactInput,
  CreateEngageProviderInput,
  CreateEngageTaskInput,
  CreateEngageSenderAccountInput,
  QueueEngageDispatchInput,
} from '../repositories/engageRepository.js'
import { readJson, writeJson } from '../utils/http.js'

export async function handleEngageRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  repo: EngageRepository,
  corsOrigin: string,
): Promise<boolean> {
  const url = req.url ?? ''
  const method = req.method ?? ''

  if (method === 'GET' && url === '/api/engage/summary') {
    const summary = await repo.summary()
    writeJson(res, 200, { ok: true, summary }, corsOrigin)
    return true
  }

  if (method === 'GET' && url === '/api/engage/contacts') {
    const contacts = await repo.listContacts()
    writeJson(res, 200, { ok: true, contacts }, corsOrigin)
    return true
  }

  if (method === 'POST' && url === '/api/engage/contacts') {
    const body = await readJson<CreateEngageContactInput>(req)
    if (!body?.name) {
      writeJson(res, 400, { ok: false, error: 'name e obrigatorio' }, corsOrigin)
      return true
    }
    const contact = await repo.createContact(body)
    writeJson(res, 201, { ok: true, contact }, corsOrigin)
    return true
  }

  if (method === 'GET' && url === '/api/engage/campaigns') {
    const campaigns = await repo.listCampaigns()
    writeJson(res, 200, { ok: true, campaigns }, corsOrigin)
    return true
  }

  if (method === 'POST' && url === '/api/engage/campaigns') {
    const body = await readJson<CreateEngageCampaignInput>(req)
    if (!body?.name || !body?.channel) {
      writeJson(res, 400, { ok: false, error: 'name e channel sao obrigatorios' }, corsOrigin)
      return true
    }
    const campaign = await repo.createCampaign(body)
    writeJson(res, 201, { ok: true, campaign }, corsOrigin)
    return true
  }

  if (method === 'GET' && url === '/api/engage/providers') {
    const providers = await repo.listProviders()
    writeJson(res, 200, { ok: true, providers }, corsOrigin)
    return true
  }

  if (method === 'POST' && url === '/api/engage/providers') {
    const body = await readJson<CreateEngageProviderInput>(req)
    if (!body?.key || !body?.name || !body?.channel) {
      writeJson(res, 400, { ok: false, error: 'key, name e channel sao obrigatorios' }, corsOrigin)
      return true
    }
    const provider = await repo.createProvider(body)
    writeJson(res, 201, { ok: true, provider }, corsOrigin)
    return true
  }

  if (method === 'GET' && url === '/api/engage/sender-accounts') {
    const senderAccounts = await repo.listSenderAccounts()
    writeJson(res, 200, { ok: true, senderAccounts }, corsOrigin)
    return true
  }

  if (method === 'POST' && url === '/api/engage/sender-accounts') {
    const body = await readJson<CreateEngageSenderAccountInput>(req)
    if (!body?.provider_id || !body?.label || !body?.channel) {
      writeJson(res, 400, { ok: false, error: 'provider_id, label e channel sao obrigatorios' }, corsOrigin)
      return true
    }
    const senderAccount = await repo.createSenderAccount(body)
    writeJson(res, 201, { ok: true, senderAccount }, corsOrigin)
    return true
  }

  if (method === 'GET' && url === '/api/engage/inbox') {
    const events = await repo.listEvents(50)
    const tasks = await repo.listTasks(50)
    writeJson(res, 200, { ok: true, events, tasks }, corsOrigin)
    return true
  }

  if (method === 'GET' && url === '/api/engage/events') {
    const events = await repo.listEvents()
    writeJson(res, 200, { ok: true, events }, corsOrigin)
    return true
  }

  if (method === 'POST' && url === '/api/engage/events') {
    const body = await readJson<CreateEngageEventInput>(req)
    if (!body?.event_type) {
      writeJson(res, 400, { ok: false, error: 'event_type e obrigatorio' }, corsOrigin)
      return true
    }
    const event = await repo.createEvent(body)
    writeJson(res, 201, { ok: true, event }, corsOrigin)
    return true
  }

  if (method === 'GET' && url === '/api/engage/tasks') {
    const tasks = await repo.listTasks()
    writeJson(res, 200, { ok: true, tasks }, corsOrigin)
    return true
  }

  if (method === 'POST' && url === '/api/engage/tasks') {
    const body = await readJson<CreateEngageTaskInput>(req)
    if (!body?.title || !body?.type) {
      writeJson(res, 400, { ok: false, error: 'title e type sao obrigatorios' }, corsOrigin)
      return true
    }
    const task = await repo.createTask(body)
    writeJson(res, 201, { ok: true, task }, corsOrigin)
    return true
  }

  if (method === 'POST' && url === '/api/engage/queue') {
    const body = await readJson<QueueEngageDispatchInput>(req)
    if (!body?.campaign_id || !body?.contact_id || !body?.body || !body?.channel) {
      writeJson(res, 400, { ok: false, error: 'campaign_id, contact_id, body e channel sao obrigatorios' }, corsOrigin)
      return true
    }
    const queued = await repo.queueDispatch(body)
    writeJson(res, 201, { ok: true, queued }, corsOrigin)
    return true
  }

  if (method === 'POST' && url === '/api/webhooks/engage') {
    const body = await readJson<{
      contact_id?: string | null
      channel?: string
      provider_id?: string | null
      conversation_id?: string | null
      event_type?: string
      message?: string | null
      payload_json?: Record<string, unknown>
    }>(req)
    if (!body?.contact_id || !body?.channel || !body?.event_type) {
      writeJson(res, 400, { ok: false, error: 'contact_id, channel e event_type sao obrigatorios' }, corsOrigin)
      return true
    }

    const conversation = await repo.upsertConversation({
      contact_id: body.contact_id,
      channel: body.channel,
      last_message_at: new Date().toISOString(),
    })
    const message = await repo.createMessage({
      conversation_id: conversation.id,
      direction: body.event_type === 'message.sent' ? 'outgoing' : 'incoming',
      channel: body.channel,
      body: body.message ?? body.event_type,
      payload_json: body.payload_json ?? {},
      status: 'received',
    })
    const event = await repo.createEvent({
      contact_id: body.contact_id,
      conversation_id: conversation.id,
      message_id: message.id,
      event_type: body.event_type,
      provider_id: body.provider_id ?? null,
      payload_json: body.payload_json ?? {},
    })
    if (body.event_type === 'message.replied') {
      await repo.createTask({
        contact_id: body.contact_id,
        conversation_id: conversation.id,
        title: 'Responder lead no Engage',
        type: 'followup',
        status: 'open',
        due_at: null,
      })
    }
    writeJson(res, 201, { ok: true, conversation, message, event }, corsOrigin)
    return true
  }

  return false
}
