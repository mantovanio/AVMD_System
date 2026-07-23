import type { AivenSqlClient } from '../db/aivenClient.js'
import type { BackendConfig } from '../config/env.js'
import type { CommunicationOutboxRepository } from '../repositories/communicationOutboxRepository.js'
import { sendEvolutionMessage } from '../integrations/evolutionAdapter.js'

export type OutboxProcessorResult = {
  processed: number
  sent: number
  failed: number
}

function pickInstance(config: BackendConfig, payload: Record<string, unknown>) {
  const canal = String(payload.canal ?? 'atendimento').trim()
  return canal === 'renovacao' || canal === 'checkout'
    ? config.evolutionCertiid
    : config.evolutionAtendimento
}

function normalizePhoneBR(value: string): string {
  const digits = value.replace(/\D/g, '')
  if (!digits) return value
  if (digits.startsWith('55') && digits.length >= 12) return digits
  if (digits.length === 10 || digits.length === 11) return `55${digits}`
  return digits
}

function normalizePhoneBRWithoutDdi(value: string): string | null {
  const digits = value.replace(/\D/g, '')
  if (!digits) return null
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) return digits.slice(2)
  if (digits.length === 10 || digits.length === 11) return digits
  return null
}

type ChatCustomerContext = {
  nome: string | null
  email: string | null
  telefone: string | null
  cpf: string | null
  cnpj: string | null
  cadastro_base_id: string | null
  crm_customer_id: string | null
  renovacao_id: string | null
  fila: string | null
}

const MAX_FOLLOWUP_ROUNDS = 3
const WHATSAPP_SPACING_MS = 12_000

export class OutboxProcessor {
  private intervalId: ReturnType<typeof setInterval> | null = null
  private isProcessing = false

  constructor(
    private readonly outboxRepo: CommunicationOutboxRepository,
    private readonly config: BackendConfig,
    private readonly db?: AivenSqlClient,
  ) {}

  start(intervalMs = 5_000) {
    if (this.intervalId) return
    const tick = async () => {
      try {
        await this.processPending()
      } catch (error) {
        console.error('[OutboxProcessor] Erro no ciclo:', error)
      }
    }
    tick()
    this.intervalId = setInterval(tick, intervalMs)
    console.error(`[OutboxProcessor] Iniciado a cada ${intervalMs}ms`)
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
      console.error('[OutboxProcessor] Parado')
    }
  }

  async processPending(limit = 10): Promise<OutboxProcessorResult> {
    if (this.isProcessing) return { processed: 0, sent: 0, failed: 0 }
    this.isProcessing = true
    try {
      const items = await this.outboxRepo.listPending(limit)
      if (items.length === 0) return { processed: 0, sent: 0, failed: 0 }

      let sent = 0
      let failed = 0

      for (let index = 0; index < items.length; index += 1) {
        const item = items[index]
        try {
          if (item.channel === 'whatsapp') {
            await this.sendWhatsApp(item)
            if (items.slice(index + 1).some(next => next.channel === 'whatsapp')) {
              await this.sleep(WHATSAPP_SPACING_MS)
            }
          } else if (item.channel === 'email') {
            await this.sendEmail(item)
          } else {
            await this.outboxRepo.markProcessed({
              id: item.id,
              status: 'failed',
              error: `Canal desconhecido: ${item.channel}`,
            })
            failed++
            continue
          }
          sent++
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Erro desconhecido'
          await this.outboxRepo.markProcessed({
            id: item.id,
            status: 'failed',
            error: message,
          })
          failed++
        }
      }

      return { processed: items.length, sent, failed }
    } finally {
      this.isProcessing = false
    }
  }

  private async sendWhatsApp(item: {
    id: string
    to_address: string
    body: string
    payload: Record<string, unknown>
  }) {
    if (await this.shouldSkipRenewalMessage(item)) {
      await this.outboxRepo.markProcessed({
        id: item.id,
        status: 'failed',
        error: 'Renovacao ja vinculada a venda realizada/paga; envio bloqueado.',
      })
      return
    }

    const instance = pickInstance(this.config, item.payload)
    const result = await sendEvolutionMessage(instance, item.to_address, item.body)
    await this.outboxRepo.markProcessed({
      id: item.id,
      status: result.ok ? 'sent' : 'failed',
      error: result.error ?? null,
      externalId: result.external_id ?? null,
    })

    if (result.ok) {
      await this.logOutgoingMessage(item, result.external_id ?? null)
      await this.scheduleNextFollowUpIfNeeded(item)
    }
  }

  private async logOutgoingMessage(item: { to_address: string; body: string; payload: Record<string, unknown> }, externalId: string | null) {
    if (!this.db) return
    try {
      const phoneDigits = normalizePhoneBR(item.to_address)
      const phoneKey = normalizePhoneBRWithoutDdi(item.to_address)
      const canal = String(item.payload.canal ?? 'atendimento').trim()
      const tipo = String(item.payload.tipo ?? '').trim()
      const senderName = tipo.includes('renovacao') ? 'Clara (IA)' : 'Sistema'
      const context = await this.resolveChatCustomerContext({
        phoneKey,
        renovacaoId: typeof item.payload.renovacao_id === 'string' ? item.payload.renovacao_id : null,
        canal,
      })
      const resolvedName = context?.nome?.trim() || null
      const resolvedPhone = context?.telefone?.trim() || phoneDigits
      const resolvedQueue = context?.fila?.trim() || canal

      const convResult = await this.db.query<{ id: string }>(
        `SELECT id
           FROM crm_chat_conversations
          WHERE fn_normalize_phone_br(telefone) = $1
             OR fn_normalize_phone_br(document_key) = $1
          ORDER BY updated_at DESC NULLS LAST
          LIMIT 1`,
        [phoneKey],
      )
      let convId = convResult.rows[0]?.id ?? null

      if (!convId) {
        const insertConv = await this.db.query<{ id: string }>(
          `INSERT INTO crm_chat_conversations (
             document_key, telefone, whatsapp_instance, fila, ultima_mensagem,
             ultima_mensagem_direcao, ultima_interacao_em, kanban_status,
             cliente_nome, crm_customer_id
           )
           VALUES ($1, $2, $3, $4, $5, 'outgoing', NOW(), 'conversando', $6, $7::uuid)
           RETURNING id`,
          [
            phoneDigits,
            resolvedPhone,
            resolvedQueue === 'renovacao' ? 'CertiID' : 'atendimento',
            resolvedQueue,
            item.body,
            resolvedName,
            context?.crm_customer_id ?? null,
          ],
        )
        convId = insertConv.rows[0]?.id ?? null
      }

      if (!convId) return

      if (canal === 'renovacao') {
        await this.db.query(
          `UPDATE crm_chat_conversations
              SET fila = 'renovacao',
                  whatsapp_instance = coalesce(whatsapp_instance, 'CertiID'),
                  telefone = coalesce($2, telefone),
                  cliente_nome = coalesce($3, nullif(cliente_nome, ''), cliente_nome),
                  crm_customer_id = coalesce($4::uuid, crm_customer_id)
            WHERE id = $1`,
          [convId, resolvedPhone, resolvedName, context?.crm_customer_id ?? null],
        )
      } else if (resolvedName || context?.crm_customer_id) {
        await this.db.query(
          `UPDATE crm_chat_conversations
              SET telefone = coalesce($2, telefone),
                  cliente_nome = coalesce($3, nullif(cliente_nome, ''), cliente_nome),
                  crm_customer_id = coalesce($4::uuid, crm_customer_id)
            WHERE id = $1`,
          [convId, resolvedPhone, resolvedName, context?.crm_customer_id ?? null],
        )
      }

      await this.db.query(
        `INSERT INTO crm_chat_messages (conversation_id, document_key, external_message_id, direction, sender_type, sender_name, mensagem)
         VALUES ($1, $2, $3, 'outgoing', 'automation', $4, $5)`,
        [convId, phoneDigits, externalId, senderName, item.body],
      )

      await this.db.query(
        `UPDATE crm_chat_conversations SET ultima_mensagem = $1, ultima_mensagem_direcao = 'outgoing', ultima_interacao_em = NOW() WHERE id = $2`,
        [item.body, convId],
      )
    } catch (err) {
      console.error('[OutboxProcessor] Erro ao registrar mensagem no CRM chat:', err)
    }
  }

  private async shouldSkipRenewalMessage(item: { to_address: string; payload: Record<string, unknown> }): Promise<boolean> {
    if (!this.db) return false
    const tipo = typeof item.payload.tipo === 'string' ? item.payload.tipo : ''
    if (!tipo.startsWith('renovacao')) return false

    const renovacaoId = typeof item.payload.renovacao_id === 'string' ? item.payload.renovacao_id : null
    const phoneKey = normalizePhoneBRWithoutDdi(item.to_address)
    if (!renovacaoId && !phoneKey) return false

    const result = await this.db.query<{ id: string }>(
      `WITH alvo AS (
         SELECT *
           FROM renovacoes
          WHERE deleted_at IS NULL
            AND (
              ($1::uuid IS NOT NULL AND id = $1::uuid)
              OR ($2::text IS NOT NULL AND fn_normalize_phone_br(telefone) = $2)
            )
          ORDER BY
            CASE WHEN $1::uuid IS NOT NULL AND id = $1::uuid THEN 0 ELSE 1 END,
            updated_at DESC NULLS LAST
          LIMIT 1
       )
       SELECT r.id
         FROM alvo r
        WHERE coalesce(r.renovado, false) = true
           OR r.status IN ('convertido', 'perdido')
           OR EXISTS (
             SELECT 1
               FROM vendas_certificados v
               LEFT JOIN cadastros_base cb ON cb.id = v.cadastro_base_id
              WHERE coalesce(v.status_venda, '') <> 'cancelado'
                AND (
                  coalesce(v.pago, false) = true
                  OR coalesce(v.status_pagamento, '') = 'pago'
                  OR coalesce(v.status_venda, '') IN ('vendido', 'emitido')
                )
                AND (
                  (r.cadastro_base_id IS NOT NULL AND v.cadastro_base_id = r.cadastro_base_id)
                  OR (r.venda_certificado_id IS NOT NULL AND v.id = r.venda_certificado_id)
                  OR regexp_replace(coalesce(v.documento_faturamento, cb.cpf_cnpj, ''), '\\D', '', 'g')
                     = regexp_replace(coalesce(r.cpf, r.cnpj, ''), '\\D', '', 'g')
                  OR ($2::text IS NOT NULL AND (fn_normalize_phone_br(v.telefone_faturamento) = $2 OR fn_normalize_phone_br(cb.telefone) = $2))
                )
           )
        LIMIT 1`,
      [renovacaoId, phoneKey],
    )

    return Boolean(result.rows[0]?.id)
  }

  private async resolveChatCustomerContext(input: { phoneKey: string | null; renovacaoId: string | null; canal: string }): Promise<ChatCustomerContext | null> {
    if (!this.db) return null
    const result = await this.db.query<ChatCustomerContext>(
      `WITH renovacao_match AS (
         SELECT r.*
           FROM renovacoes r
          WHERE r.deleted_at IS NULL
            AND (
              ($1::uuid IS NOT NULL AND r.id = $1::uuid)
              OR ($2::text IS NOT NULL AND fn_normalize_phone_br(r.telefone) = $2)
            )
          ORDER BY
            CASE WHEN $1::uuid IS NOT NULL AND r.id = $1::uuid THEN 0 ELSE 1 END,
            r.updated_at DESC NULLS LAST
          LIMIT 1
       ),
       venda_match AS (
         SELECT v.*, cb.id AS cb_id, cb.nome AS cb_nome, cb.email AS cb_email, cb.telefone AS cb_telefone, cb.cpf_cnpj AS cb_documento
           FROM vendas_certificados v
           LEFT JOIN cadastros_base cb ON cb.id = v.cadastro_base_id
           LEFT JOIN renovacao_match r ON true
          WHERE coalesce(v.status_venda, '') <> 'cancelado'
            AND (
              (r.venda_certificado_id IS NOT NULL AND v.id = r.venda_certificado_id)
              OR (r.cadastro_base_id IS NOT NULL AND v.cadastro_base_id = r.cadastro_base_id)
              OR ($2::text IS NOT NULL AND (
                fn_normalize_phone_br(v.telefone_faturamento) = $2
                OR fn_normalize_phone_br(cb.telefone) = $2
              ))
              OR (coalesce(r.cpf, r.cnpj, '') <> '' AND regexp_replace(coalesce(v.documento_faturamento, cb.cpf_cnpj, ''), '\\D', '', 'g') = regexp_replace(coalesce(r.cpf, r.cnpj, ''), '\\D', '', 'g'))
            )
          ORDER BY
            CASE WHEN coalesce(v.status_venda, '') IN ('vendido', 'emitido') OR coalesce(v.status_pagamento, '') = 'pago' OR coalesce(v.pago, false) THEN 0 ELSE 1 END,
            coalesce(v.data_inicio_validade::date, v.data_vencimento::date, v.created_at::date) DESC
          LIMIT 1
       ),
       base_match AS (
         SELECT cb.*
           FROM cadastros_base cb
           LEFT JOIN renovacao_match r ON true
           LEFT JOIN venda_match v ON true
          WHERE ($2::text IS NOT NULL AND fn_normalize_phone_br(cb.telefone) = $2)
             OR (v.cadastro_base_id IS NOT NULL AND cb.id = v.cadastro_base_id)
             OR (r.cadastro_base_id IS NOT NULL AND cb.id = r.cadastro_base_id)
             OR (coalesce(r.cpf, r.cnpj, '') <> '' AND regexp_replace(coalesce(cb.cpf_cnpj, ''), '\\D', '', 'g') = regexp_replace(coalesce(r.cpf, r.cnpj, ''), '\\D', '', 'g'))
          ORDER BY cb.updated_at DESC NULLS LAST
          LIMIT 1
       ),
       crm_match AS (
         SELECT c.*
           FROM crm_customers c
           LEFT JOIN base_match cb ON true
           LEFT JOIN renovacao_match r ON true
          WHERE ($2::text IS NOT NULL AND fn_normalize_phone_br(c.telefone) = $2)
             OR (cb.email IS NOT NULL AND lower(coalesce(c.email, '')) = lower(cb.email))
             OR (regexp_replace(coalesce(c.cpf, c.cnpj, ''), '\\D', '', 'g') <> '' AND regexp_replace(coalesce(c.cpf, c.cnpj, ''), '\\D', '', 'g') = regexp_replace(coalesce(cb.cpf_cnpj, r.cpf, r.cnpj, ''), '\\D', '', 'g'))
          ORDER BY c.updated_at DESC NULLS LAST
          LIMIT 1
       )
       SELECT
         coalesce(b.nome, v.cb_nome, v.nome_faturamento, r.razao_social, r.cliente, c.nome) AS nome,
         coalesce(b.email, v.cb_email, v.email_faturamento, r.email, c.email) AS email,
         coalesce(b.telefone, v.cb_telefone, v.telefone_faturamento, r.telefone, c.telefone) AS telefone,
         coalesce(nullif(r.cpf, ''), case when length(regexp_replace(coalesce(b.cpf_cnpj, v.cb_documento, v.documento_faturamento, c.cpf, ''), '\\D', '', 'g')) = 11 then regexp_replace(coalesce(b.cpf_cnpj, v.cb_documento, v.documento_faturamento, c.cpf, ''), '\\D', '', 'g') else null end) AS cpf,
         coalesce(nullif(r.cnpj, ''), case when length(regexp_replace(coalesce(b.cpf_cnpj, v.cb_documento, v.documento_faturamento, c.cnpj, ''), '\\D', '', 'g')) = 14 then regexp_replace(coalesce(b.cpf_cnpj, v.cb_documento, v.documento_faturamento, c.cnpj, ''), '\\D', '', 'g') else null end) AS cnpj,
         b.id::text AS cadastro_base_id,
         c.id::text AS crm_customer_id,
         r.id::text AS renovacao_id,
         CASE WHEN $3::text = 'renovacao' OR r.id IS NOT NULL THEN 'renovacao' ELSE $3::text END AS fila
        FROM (SELECT 1) seed
        LEFT JOIN renovacao_match r ON true
        LEFT JOIN venda_match v ON true
        LEFT JOIN base_match b ON true
        LEFT JOIN crm_match c ON true
        LIMIT 1`,
      [input.renovacaoId, input.phoneKey, input.canal],
    )

    const context = result.rows[0] ?? null
    if (!context || (!context.nome && !context.email && !context.telefone)) return null
    const crmCustomerId = await this.ensureCrmCustomer(context)
    return { ...context, crm_customer_id: crmCustomerId ?? context.crm_customer_id }
  }

  private async ensureCrmCustomer(context: ChatCustomerContext): Promise<string | null> {
    if (!this.db) return context.crm_customer_id
    if (context.crm_customer_id) return context.crm_customer_id
    if (!context.nome && !context.telefone && !context.email) return null

    const result = await this.db.query<{ id: string }>(
      `INSERT INTO crm_customers (nome, telefone, email, cpf, cnpj, contato_status, observacoes)
       VALUES ($1, $2, $3, $4, $5, 'novo', $6)
       RETURNING id`,
      [
        context.nome ?? context.telefone ?? context.email ?? 'Cliente',
        context.telefone,
        context.email,
        context.cpf,
        context.cnpj,
        context.cadastro_base_id ? `Vinculado ao cadastro base ${context.cadastro_base_id}` : null,
      ],
    )
    return result.rows[0]?.id ?? null
  }

  private async scheduleNextFollowUpIfNeeded(item: { to_address: string; payload: Record<string, unknown> }) {
    const tipo = typeof item.payload.tipo === 'string' ? item.payload.tipo : ''
    if (tipo !== 'renovacao_followup_auto') return
    const currentRound = typeof item.payload.followup_round === 'number' ? item.payload.followup_round : 1
    if (currentRound >= MAX_FOLLOWUP_ROUNDS) return
    const renovacaoId = typeof item.payload.renovacao_id === 'string' ? item.payload.renovacao_id : null
    if (!renovacaoId) return
    const nextRound = currentRound + 1
    const delayMs = nextRound * 24 * 3600 * 1000
    try {
      await this.outboxRepo.create({
        channel: 'whatsapp',
        provider: String(item.payload.provider ?? 'evolution'),
        to_address: item.to_address,
        body: 'Olá! Ainda aguardamos sua resposta sobre a renovação do seu certificado. Podemos ajudar?',
        payload: {
          renovacao_id: renovacaoId,
          canal: typeof item.payload.canal === 'string' ? item.payload.canal : 'renovacao',
          tipo: 'renovacao_followup_auto',
          followup_round: nextRound,
          instance_name: item.payload.instance_name ?? null,
          integration_id: item.payload.integration_id ?? null,
          whatsapp_engine: item.payload.whatsapp_engine ?? null,
        },
        scheduled_for: new Date(Date.now() + delayMs).toISOString(),
      })
    } catch (err) {
      console.error('[OutboxProcessor] Erro ao agendar proximo follow-up:', err)
    }
  }

  private async sendEmail(item: {
    id: string
    to_address: string
    subject: string | null
    body: string
    payload: Record<string, unknown>
  }) {
    const url = this.config.n8nEmailSendUrl
    if (!url) {
      await this.outboxRepo.markProcessed({
        id: item.id,
        status: 'failed',
        error: 'n8nEmailSendUrl nao configurada',
      })
      return
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: item.to_address,
        subject: item.subject ?? 'Sem assunto',
        body: item.body,
        html: typeof item.payload.html === 'string' ? item.payload.html : null,
        payload: item.payload,
      }),
    })

    const ok = response.ok
    await this.outboxRepo.markProcessed({
      id: item.id,
      status: ok ? 'sent' : 'failed',
      error: ok ? null : `Email n8n retornou HTTP ${response.status}`,
    })
  }

  private async sleep(ms: number) {
    await new Promise(resolve => setTimeout(resolve, ms))
  }
}
