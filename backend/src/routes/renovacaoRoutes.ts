import type { IncomingMessage, ServerResponse } from 'node:http'
import type { RenovacaoRepository, CreateRenovacaoInput, UpdateRenovacaoInput } from '../repositories/renovacaoRepository.js'
import type { LeadRepository, CreateLeadInput } from '../repositories/leadRepository.js'
import type { CommunicationOutboxRepository } from '../repositories/communicationOutboxRepository.js'
import type { CatalogRepository } from '../repositories/catalogRepository.js'
import type { AivenSqlClient } from '../db/aivenClient.js'
import { readJson, writeJson } from '../utils/http.js'

export async function handleRenovacaoRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  renovacaoRepo: RenovacaoRepository,
  leadRepo: LeadRepository,
  outboxRepo: CommunicationOutboxRepository,
  catalogRepo: CatalogRepository,
  corsOrigin: string,
  db: AivenSqlClient,
): Promise<boolean> {
  const url = req.url ?? ''
  const method = req.method ?? ''
  const parsedUrl = new URL(url, 'http://localhost')
  const scope = parsedUrl.searchParams.get('scope') ?? 'operacional'
  const windowDays = Number(parsedUrl.searchParams.get('days') ?? '30')
  const safeDays = Number.isFinite(windowDays) && windowDays > 0 ? Math.min(windowDays, 180) : 30
  const limit = Number(parsedUrl.searchParams.get('limit') ?? '200')
  const offset = Number(parsedUrl.searchParams.get('offset') ?? '0')
  const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.min(limit, 2000) : 200
  const safeOffset = Number.isFinite(offset) && offset >= 0 ? offset : 0

  // GET /api/renovacoes — lista todos (ativos)
  if (method === 'GET' && parsedUrl.pathname === '/api/renovacoes') {
    const rows = scope === 'historico'
      ? await renovacaoRepo.findHistorico(safeDays, safeLimit, safeOffset)
      : scope === 'todos'
        ? await renovacaoRepo.findAll(safeLimit, safeOffset)
        : await renovacaoRepo.findOperacionais(safeDays, safeLimit, safeOffset)
    writeJson(res, 200, { ok: true, renovacoes: rows }, corsOrigin)
    return true
  }

  // GET /api/renovacoes/pendentes — endpoint para N8N buscar quem precisa de lembrete
  if (method === 'GET' && url === '/api/renovacoes/pendentes') {
    const rows = await renovacaoRepo.findPendentesN8n()
    writeJson(res, 200, { ok: true, renovacoes: rows }, corsOrigin)
    return true
  }

  // POST /api/renovacoes — criar um registro
  if (method === 'POST' && url === '/api/renovacoes') {
    const body = await readJson<CreateRenovacaoInput>(req)
    if (!body?.data_vencimento || !body?.cliente) {
      writeJson(res, 400, { ok: false, error: 'data_vencimento e cliente sao obrigatorios' }, corsOrigin)
      return true
    }
    const row = await renovacaoRepo.create(body)
    writeJson(res, 201, { ok: true, renovacao: row }, corsOrigin)
    return true
  }

  // POST /api/renovacoes/bulk — importar lote
  if (method === 'POST' && url === '/api/renovacoes/bulk') {
    const body = await readJson<{ records: CreateRenovacaoInput[] }>(req)
    if (!Array.isArray(body?.records) || body.records.length === 0) {
      writeJson(res, 400, { ok: false, error: 'records deve ser um array nao vazio' }, corsOrigin)
      return true
    }
    const count = await renovacaoRepo.bulkCreate(body.records)
    writeJson(res, 201, { ok: true, inserted: count }, corsOrigin)
    return true
  }

  // POST /api/renovacoes/import-to-base — upsert registros selecionados em cadastros_base
  if (method === 'POST' && url === '/api/renovacoes/import-to-base') {
    const body = await readJson<{ ids?: string[] }>(req)
    const rows = body?.ids?.length
      ? await renovacaoRepo.findByIds(body.ids)
      : await renovacaoRepo.findAll()
    const criados: { cpf_cnpj: string; nome: string }[] = []
    const jaExistem: { cpf_cnpj: string; nome: string }[] = []
    const erros: { cliente: string; motivo: string }[] = []

    const cpfs = rows.map(r => (r.cpf || r.cnpj || '').replace(/\D/g, '')).filter(Boolean)
    const uniqCpfs = [...new Set(cpfs)]
    const existentes = await catalogRepo.getExistingCpfs(uniqCpfs)
    const docsNoLote = new Set(existentes)

    const toInsert: Record<string, unknown>[] = []
    for (const r of rows) {
      const doc = (r.cpf || r.cnpj || '').replace(/\D/g, '')
      if (!doc) { erros.push({ cliente: r.cliente, motivo: 'Sem CPF nem CNPJ' }); continue }
      const nomeBase = r.razao_social || r.cliente
      if (docsNoLote.has(doc)) { jaExistem.push({ cpf_cnpj: doc, nome: nomeBase }); continue }
      docsNoLote.add(doc)
      toInsert.push({
        tipo_cliente: r.cnpj ? 'pj' : 'pf',
        tipo_cadastro: 'cliente',
        cpf_cnpj: doc,
        nome: nomeBase,
        nome_fantasia: r.cliente || null,
        email: r.email || null,
        telefone: r.telefone ? r.telefone.replace(/\D/g, '') : null,
        status: 'ativo',
      })
    }

    if (toInsert.length > 0) {
      await catalogRepo.batchInsertCadastros(toInsert)
    }

    criados.push(...toInsert.map(t => ({ cpf_cnpj: String(t.cpf_cnpj ?? ''), nome: String(t.nome ?? '') })))

    writeJson(res, 200, { ok: true, criados: criados.length, jaExistem: jaExistem.length, erros: erros.length, detalhes: { criados, jaExistem, erros } }, corsOrigin)
    return true
  }

  // POST /api/renovacoes/import-to-crm — upsert contatos em crm_customers
  if (method === 'POST' && url === '/api/renovacoes/import-to-crm') {
    const body = await readJson<{ ids?: string[] }>(req)
    const rows = body?.ids?.length
      ? await renovacaoRepo.findByIds(body.ids)
      : await renovacaoRepo.findAll()
    const criados: { doc: string; nome: string }[] = []
    const jaExistem: { doc: string; nome: string }[] = []
    const erros: { cliente: string; motivo: string }[] = []

    for (const r of rows) {
      const doc = (r.cpf || r.cnpj || '').replace(/\D/g, '')
      const telefone = r.telefone ? r.telefone.replace(/\D/g, '') : null
      const email = r.email || null
      if (!doc && !telefone && !email) {
        erros.push({ cliente: r.cliente, motivo: 'Sem CPF, CNPJ, telefone nem email' })
        continue
      }

      try {
        const existing = await db.query<{ id: string }>(
          `SELECT id FROM crm_customers
            WHERE ($1::text is not null and regexp_replace(coalesce(cpf, ''), '\D', '', 'g') = $1)
               OR ($2::text is not null and regexp_replace(coalesce(cnpj, ''), '\D', '', 'g') = $2)
               OR ($3::text is not null and regexp_replace(coalesce(telefone, ''), '\D', '', 'g') = $3)
               OR ($4::text is not null and lower(coalesce(email, '')) = lower($4))
            ORDER BY updated_at DESC, created_at DESC
            LIMIT 1`,
          [
            r.cpf?.replace(/\D/g, '') || null,
            r.cnpj?.replace(/\D/g, '') || null,
            telefone,
            email,
          ],
        )

        if (existing.rows[0]?.id) {
          await db.query(
            `UPDATE crm_customers
                SET nome = coalesce($2, nome),
                    telefone = coalesce($3, telefone),
                    email = coalesce($4, email),
                    cpf = coalesce($5, cpf),
                    cnpj = coalesce($6, cnpj),
                    observacoes = coalesce($7, observacoes),
                    updated_at = now()
              WHERE id = $1::uuid`,
            [
              existing.rows[0].id,
              r.razao_social || r.cliente,
              telefone,
              email,
              r.cpf?.replace(/\D/g, '') || null,
              r.cnpj?.replace(/\D/g, '') || null,
              r.observacoes || null,
            ],
          )
          jaExistem.push({ doc: doc || telefone || email || '', nome: r.razao_social || r.cliente })
        } else {
          await db.query(
            `INSERT INTO crm_customers (nome, telefone, email, cpf, cnpj, observacoes)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [
              r.razao_social || r.cliente,
              telefone,
              email,
              r.cpf?.replace(/\D/g, '') || null,
              r.cnpj?.replace(/\D/g, '') || null,
              r.observacoes || null,
            ],
          )
          criados.push({ doc: doc || telefone || email || '', nome: r.razao_social || r.cliente })
        }
      } catch (err) {
        erros.push({ cliente: r.cliente, motivo: String(err) })
      }
    }

    const cadastroBatch: Record<string, unknown>[] = []
    for (const r of rows) {
      const doc = (r.cpf || r.cnpj || '').replace(/\D/g, '')
      if (!doc) continue
      cadastroBatch.push({
        tipo_cliente: r.cnpj ? 'pj' : 'pf',
        tipo_cadastro: 'cliente',
        cpf_cnpj: doc,
        nome: r.razao_social || r.cliente,
        nome_fantasia: r.cliente || null,
        email: r.email || null,
        telefone: r.telefone ? r.telefone.replace(/\D/g, '') : null,
        status: 'ativo',
      })
    }
    if (cadastroBatch.length > 0) {
      await catalogRepo.batchInsertCadastros(cadastroBatch)
    }
    const baseInserted = cadastroBatch.length

    writeJson(res, 200, {
      ok: true,
      criados: criados.length,
      jaExistem: jaExistem.length,
      erros: erros.length,
      detalhes: { criados, jaExistem, erros, baseInserted },
    }, corsOrigin)
    return true
  }

  // PATCH /api/renovacoes/bulk — atualizar status em lote
  if (method === 'PATCH' && url === '/api/renovacoes/bulk') {
    const body = await readJson<{ ids: string[]; update: UpdateRenovacaoInput }>(req)
    if (!Array.isArray(body?.ids) || !body.update) {
      writeJson(res, 400, { ok: false, error: 'ids e update sao obrigatorios' }, corsOrigin)
      return true
    }
    const count = await renovacaoRepo.bulkUpdate(body.ids, body.update)
    writeJson(res, 200, { ok: true, updated: count }, corsOrigin)
    return true
  }

  // PATCH /api/renovacoes/:id — atualizar um registro
  const patchMatch = url.match(/^\/api\/renovacoes\/([^/]+)$/)
  if (method === 'PATCH' && patchMatch) {
    const id = patchMatch[1]
    const body = await readJson<UpdateRenovacaoInput>(req)
    const updated = await renovacaoRepo.update(id, body)
    if (!updated) {
      writeJson(res, 404, { ok: false, error: 'Renovacao nao encontrada' }, corsOrigin)
      return true
    }
    writeJson(res, 200, { ok: true, renovacao: updated }, corsOrigin)
    return true
  }

  // POST /api/renovacoes/:id/lead — criar lead no kanban a partir de uma renovacao
  const leadMatch = url.match(/^\/api\/renovacoes\/([^/]+)\/lead$/)
  if (method === 'POST' && leadMatch) {
    const renovacaoId = leadMatch[1]
    const body = await readJson<CreateLeadInput>(req)
    const lead = await leadRepo.create(body)
    writeJson(res, 201, { ok: true, lead, renovacao_id: renovacaoId }, corsOrigin)
    return true
  }

  // DELETE /api/renovacoes/:id/followups — cancelar lembretes agendados
  const followupMatch = url.match(/^\/api\/renovacoes\/([^/]+)\/followups$/)
  if (method === 'DELETE' && followupMatch) {
    const renovacaoId = followupMatch[1]
    const cancelled = await outboxRepo.cancelPendingByRenovacaoId(renovacaoId, 'renovacao_followup_auto')
    writeJson(res, 200, { ok: true, cancelled }, corsOrigin)
    return true
  }

  return false
}
