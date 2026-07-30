import type { IncomingMessage, ServerResponse } from 'node:http'
import type {
  EngageRepository,
  CreateEngageCampaignInput,
  CreateEngageContactInput,
  CreateEngageProviderInput,
  CreateEngageSenderAccountInput,
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

  return false
}
