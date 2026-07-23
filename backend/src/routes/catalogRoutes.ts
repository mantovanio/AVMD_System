import type { IncomingMessage, ServerResponse } from 'node:http'
import { randomUUID } from 'node:crypto'
import { readJson, writeJson } from '../utils/http.js'
import { CatalogRepository } from '../repositories/catalogRepository.js'
import { RenovacaoRepository } from '../repositories/renovacaoRepository.js'

type SafewebImportJob = {
  id: string
  status: 'queued' | 'running' | 'done' | 'failed'
  message: string
  progress: { current: number; total: number }
  result: {
    linhas: number
    clientes: number
    vendas: number
    novos: number
    criados: number
    atualizados: number
    divergentes: number
    renovacoesConvertidas: number
  } | null
  error: string | null
  createdAt: string
  updatedAt: string
}

const safewebImportJobs = new Map<string, SafewebImportJob>()

function updateSafewebJob(id: string, patch: Partial<Omit<SafewebImportJob, 'id' | 'createdAt'>>) {
  const current = safewebImportJobs.get(id)
  if (!current) return
  safewebImportJobs.set(id, { ...current, ...patch, updatedAt: new Date().toISOString() })
}

async function processSafewebImportJob(
  id: string,
  repo: CatalogRepository,
  renovacaoRepo: RenovacaoRepository | null,
  input: {
    clientes: Record<string, unknown>[]
    vendas: Record<string, unknown>[]
    currentUserId: string
    pontoPadrao: string
    linhas: number
  },
) {
  const batchSize = 50
  let criados = 0
  let atualizados = 0
  let renovacoesConvertidas = 0

  try {
    updateSafewebJob(id, {
      status: 'running',
      message: 'Importando clientes no backend...',
      progress: { current: 0, total: input.clientes.length + input.vendas.length },
    })

    for (let i = 0; i < input.clientes.length; i += batchSize) {
      const batch = input.clientes.slice(i, i + batchSize)
      await repo.batchUpsertCadastros(batch)
      updateSafewebJob(id, {
        message: `Clientes importados: ${Math.min(i + batch.length, input.clientes.length)} de ${input.clientes.length}.`,
        progress: { current: Math.min(i + batch.length, input.clientes.length), total: input.clientes.length + input.vendas.length },
      })
    }

    const docs = input.clientes.map(item => String(item.cpf_cnpj ?? '')).filter(Boolean)
    const clientes = await repo.getClientesByDocs(docs)
    const idByDoc = new Map(clientes.map(item => [item.cpf_cnpj, item.id]))

    const vendas: Record<string, unknown>[] = input.vendas.map(venda => {
      const doc = String(venda.documento_faturamento ?? '').replace(/\D/g, '')
      return {
        ...venda,
        cadastro_base_id: venda.cadastro_base_id ?? idByDoc.get(doc) ?? null,
      }
    })

    updateSafewebJob(id, {
      message: 'Verificando protocolos existentes...',
      progress: { current: input.clientes.length, total: input.clientes.length + vendas.length },
    })

    const protocolos = vendas.map(venda => String(venda.protocolo_numero ?? '')).filter(Boolean)
    const existentes = await repo.getExistingProtocolos(protocolos)
    const existSet = new Set(existentes)
    const paraAtualizar = vendas.filter(venda => existSet.has(String(venda.protocolo_numero ?? '')))
    const paraCriar = vendas.filter(venda => !existSet.has(String(venda.protocolo_numero ?? '')))

    let precisaConciliarRenovacoes = false

    for (let i = 0; i < paraAtualizar.length; i += batchSize) {
      const batch = paraAtualizar.slice(i, i + batchSize) as unknown as { protocolo_numero: string; [key: string]: unknown }[]
      const result = await repo.batchUpdateVendasByProtocolo(batch)
      atualizados += result.updated
      precisaConciliarRenovacoes = true
      updateSafewebJob(id, {
        message: `Pedidos atualizados: ${Math.min(i + batch.length, paraAtualizar.length)} de ${paraAtualizar.length}.`,
        progress: { current: input.clientes.length + Math.min(i + batch.length, paraAtualizar.length), total: input.clientes.length + vendas.length },
      })
    }

    for (const venda of paraCriar) {
      const created = await repo.createVenda({
        ...venda,
        quantidade: 1,
        vendedor_id: input.currentUserId,
        ponto_atendimento_id: input.pontoPadrao,
        pedido_status: venda.pedido_numero ? 'gerado' : 'nao_gerado',
        protocolo_status: venda.protocolo_numero ? 'gerado' : 'nao_gerado',
        api_payload_pedido: {},
        api_payload_protocolo: {},
      })
      criados++

      if (renovacaoRepo && created?.id) {
        precisaConciliarRenovacoes = true
      }

      updateSafewebJob(id, {
        message: `Pedidos criados: ${criados} de ${paraCriar.length}.`,
        progress: { current: input.clientes.length + paraAtualizar.length + criados, total: input.clientes.length + vendas.length },
      })
    }

    if (renovacaoRepo && precisaConciliarRenovacoes) {
      updateSafewebJob(id, {
        message: 'Conciliando renovações com as vendas importadas...',
        progress: { current: input.clientes.length + vendas.length, total: input.clientes.length + vendas.length },
      })
      renovacoesConvertidas += await renovacaoRepo.reconcileConvertedFromSales()
    }

    const divergentes = await repo.countVendasEmitidosSemValidacao()
    updateSafewebJob(id, {
      status: 'done',
      message: 'Importação concluída.',
      progress: { current: input.clientes.length + vendas.length, total: input.clientes.length + vendas.length },
      result: {
        linhas: input.linhas,
        clientes: input.clientes.length,
        vendas: vendas.length,
        novos: paraCriar.length,
        criados,
        atualizados,
        divergentes,
        renovacoesConvertidas,
      },
    })
  } catch (error) {
    updateSafewebJob(id, {
      status: 'failed',
      message: 'Importação falhou.',
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

export async function handleCatalogRoutes(req: IncomingMessage, res: ServerResponse, repo: CatalogRepository, renovacaoRepo: RenovacaoRepository | null, corsOrigin: string): Promise<boolean> {
  const method = req.method ?? ''
  const url = req.url ?? ''

  // ── Bulk catalog load ─────────────────────────────────────────────────
  if (method === 'GET' && url === '/api/catalog') {
    const data = await repo.getCatalogAll()
    writeJson(res, 200, { ok: true, ...data }, corsOrigin)
    return true
  }

  // ── App settings ──────────────────────────────────────────────────────
  if (method === 'GET' && url.startsWith('/api/app-settings')) {
    const qs = new URL(url, 'http://x').searchParams.get('keys') ?? ''
    const keys = qs.split(',').map(k => k.trim()).filter(Boolean)
    const settings = await repo.getAppSettings(keys)
    writeJson(res, 200, { ok: true, settings }, corsOrigin)
    return true
  }

  if (method === 'POST' && url === '/api/app-settings') {
    const body = await readJson<{ key: string; value: unknown }>(req)
    await repo.setAppSetting(body.key, body.value)
    writeJson(res, 200, { ok: true }, corsOrigin)
    return true
  }

  // ── Profiles names lookup ─────────────────────────────────────────────
  if (method === 'POST' && url === '/api/profiles/names') {
    const body = await readJson<{ ids: string[] }>(req)
    const profiles = await repo.getProfileNames(body.ids ?? [])
    writeJson(res, 200, { ok: true, profiles }, corsOrigin)
    return true
  }

  // ── Certificados ──────────────────────────────────────────────────────
  if (method === 'GET' && url === '/api/catalog/certificados') {
    writeJson(res, 200, { ok: true, certificados: await repo.listCertificados() }, corsOrigin)
    return true
  }

  if (method === 'POST' && url === '/api/catalog/certificados') {
    try {
      const body = await readJson<Record<string, unknown>>(req)
      const certificado = await repo.saveCertificado(body)
      writeJson(res, 200, { ok: true, certificado }, corsOrigin)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[catalog] saveCertificado error:', msg)
      writeJson(res, 500, { ok: false, error: 'Erro ao salvar certificado: ' + msg }, corsOrigin)
    }
    return true
  }

  if (method === 'POST' && url === '/api/catalog/certificados/bulk') {
    try {
      const body = await readJson<{ items: Record<string, unknown>[] }>(req)
      await repo.bulkUpsertCertificados(body.items ?? [])
      writeJson(res, 200, { ok: true }, corsOrigin)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[catalog] bulkUpsertCertificados error:', msg)
      writeJson(res, 500, { ok: false, error: 'Erro ao importar certificados: ' + msg }, corsOrigin)
    }
    return true
  }

  if (method === 'DELETE' && url === '/api/catalog/certificados') {
    const body = await readJson<{ ids: string[] }>(req)
    await repo.bulkDeleteCertificados(body.ids ?? [])
    writeJson(res, 200, { ok: true }, corsOrigin)
    return true
  }

  const certIdMatch = url.match(/^\/api\/catalog\/certificados\/([^/]+)$/)
  if (certIdMatch) {
    if (method === 'PATCH') {
      const body = await readJson<{ ativo: boolean }>(req)
      await repo.toggleCertificado(certIdMatch[1], body.ativo)
      writeJson(res, 200, { ok: true }, corsOrigin)
      return true
    }
    if (method === 'DELETE') {
      await repo.deleteCertificado(certIdMatch[1])
      writeJson(res, 200, { ok: true }, corsOrigin)
      return true
    }
  }

  // ── Tabelas de preço ──────────────────────────────────────────────────
  if (method === 'GET' && url === '/api/catalog/tabelas') {
    writeJson(res, 200, { ok: true, tabelas: await repo.listTabelasPreco() }, corsOrigin)
    return true
  }

  if (method === 'POST' && url === '/api/catalog/tabelas') {
    const body = await readJson<Record<string, unknown>>(req)
    const tabela = await repo.saveTabelaPreco(body)
    writeJson(res, 200, { ok: true, tabela }, corsOrigin)
    return true
  }

  const tabelaIdMatch = url.match(/^\/api\/catalog\/tabelas\/([^/]+)$/)
  if (tabelaIdMatch) {
    if (method === 'PATCH') {
      const body = await readJson<{ ativo: boolean }>(req)
      await repo.toggleTabelaPreco(tabelaIdMatch[1], body.ativo)
      writeJson(res, 200, { ok: true }, corsOrigin)
      return true
    }
    if (method === 'DELETE') {
      await repo.deleteTabelaPreco(tabelaIdMatch[1])
      writeJson(res, 200, { ok: true }, corsOrigin)
      return true
    }
  }

  // ── Tabela itens ──────────────────────────────────────────────────────
  if (method === 'GET' && url === '/api/catalog/itens') {
    writeJson(res, 200, { ok: true, itens: await repo.listTabelaItens() }, corsOrigin)
    return true
  }

  if (method === 'POST' && url === '/api/catalog/itens') {
    const body = await readJson<Record<string, unknown>>(req)
    const item = await repo.saveTabelaItem(body)
    writeJson(res, 200, { ok: true, item }, corsOrigin)
    return true
  }

  if (method === 'POST' && url === '/api/catalog/itens/bulk') {
    const body = await readJson<{ items: Record<string, unknown>[] }>(req)
    const result = await repo.bulkUpsertTabelaItens(body.items ?? [])
    writeJson(res, 200, { ok: true, ...result }, corsOrigin)
    return true
  }

  if (method === 'POST' && url === '/api/catalog/itens/bulk-prices') {
    const body = await readJson<{ updates: { id: string; valor: number }[] }>(req)
    await repo.bulkUpdateTabelaItemPrices(body.updates ?? [])
    writeJson(res, 200, { ok: true }, corsOrigin)
    return true
  }

  if (method === 'DELETE' && url === '/api/catalog/itens') {
    const body = await readJson<{ ids: string[] }>(req)
    await repo.bulkDeleteTabelaItens(body.ids ?? [])
    writeJson(res, 200, { ok: true }, corsOrigin)
    return true
  }

  if (method === 'GET' && url === '/api/catalog/itens/certificados-id') {
    const rows = await repo.getAllCertificadosCodigoId()
    writeJson(res, 200, { ok: true, rows }, corsOrigin)
    return true
  }

  const itemIdMatch = url.match(/^\/api\/catalog\/itens\/([^/]+)$/)
  if (itemIdMatch) {
    if (method === 'PATCH') {
      const body = await readJson<Record<string, unknown>>(req)
      if ('ativo' in body) {
        await repo.toggleTabelaItem(itemIdMatch[1], body.ativo as boolean)
      } else {
        await repo.saveTabelaItem({ ...body, id: itemIdMatch[1] })
      }
      writeJson(res, 200, { ok: true }, corsOrigin)
      return true
    }
    if (method === 'DELETE') {
      await repo.deleteTabelaItem(itemIdMatch[1])
      writeJson(res, 200, { ok: true }, corsOrigin)
      return true
    }
  }

  // ── Participantes ─────────────────────────────────────────────────────
  if (method === 'GET' && url === '/api/catalog/participantes') {
    writeJson(res, 200, { ok: true, participantes: await repo.listTabelaParticipantes() }, corsOrigin)
    return true
  }

  if (method === 'POST' && url === '/api/catalog/participantes') {
    const body = await readJson<Record<string, unknown>>(req)
    const participante = await repo.saveTabelaParticipante(body)
    writeJson(res, 200, { ok: true, participante }, corsOrigin)
    return true
  }

  const partIdMatch = url.match(/^\/api\/catalog\/participantes\/([^/]+)$/)
  if (method === 'DELETE' && partIdMatch) {
    await repo.deleteTabelaParticipante(partIdMatch[1])
    writeJson(res, 200, { ok: true }, corsOrigin)
    return true
  }

  // ── Agentes tabelas ───────────────────────────────────────────────────
  if (method === 'GET' && url === '/api/catalog/agentes-tabelas') {
    writeJson(res, 200, { ok: true, agentes: await repo.listAgentesTabelaPreco() }, corsOrigin)
    return true
  }

  if (method === 'POST' && url === '/api/catalog/agentes-tabelas') {
    const body = await readJson<{ tabela_preco_id: string; agente_registro_id: string; ponto_atendimento_id?: string | null; ativo?: boolean }>(req)
    const agente = await repo.saveAgenteTabelaPreco(body)
    writeJson(res, 200, { ok: true, agente }, corsOrigin)
    return true
  }

  const agenteTabelaIdMatch = url.match(/^\/api\/catalog\/agentes-tabelas\/([^/]+)$/)
  if (agenteTabelaIdMatch) {
    if (method === 'PATCH') {
      const body = await readJson<{ ativo: boolean }>(req)
      await repo.toggleAgenteTabelaPreco(agenteTabelaIdMatch[1], body.ativo)
      writeJson(res, 200, { ok: true }, corsOrigin)
      return true
    }
    if (method === 'DELETE') {
      await repo.deleteAgenteTabelaPreco(agenteTabelaIdMatch[1])
      writeJson(res, 200, { ok: true }, corsOrigin)
      return true
    }
  }

  // ── Faixas de comissão ────────────────────────────────────────────────
  if (method === 'GET' && url === '/api/catalog/faixas-comissao') {
    writeJson(res, 200, { ok: true, comissoes: await repo.listFaixasComissao() }, corsOrigin)
    return true
  }

  if (method === 'POST' && url === '/api/catalog/faixas-comissao') {
    const body = await readJson<Record<string, unknown>>(req)
    const comissao = await repo.saveComissao(body)
    writeJson(res, 200, { ok: true, comissao }, corsOrigin)
    return true
  }

  const comissaoIdMatch = url.match(/^\/api\/catalog\/faixas-comissao\/([^/]+)$/)
  if (method === 'DELETE' && comissaoIdMatch) {
    await repo.deleteComissao(comissaoIdMatch[1])
    writeJson(res, 200, { ok: true }, corsOrigin)
    return true
  }

  // ── Formas de pagamento ───────────────────────────────────────────────
  if (method === 'GET' && url === '/api/catalog/formas-pagamento') {
    writeJson(res, 200, { ok: true, pagamentos: await repo.listFormasPagamento() }, corsOrigin)
    return true
  }

  if (method === 'POST' && url === '/api/catalog/formas-pagamento') {
    const body = await readJson<Record<string, unknown>>(req)
    const pagamento = await repo.saveFormaPagamento(body)
    writeJson(res, 200, { ok: true, pagamento }, corsOrigin)
    return true
  }

  const pgIdMatch = url.match(/^\/api\/catalog\/formas-pagamento\/([^/]+)$/)
  if (method === 'DELETE' && pgIdMatch) {
    await repo.deleteFormaPagamento(pgIdMatch[1])
    writeJson(res, 200, { ok: true }, corsOrigin)
    return true
  }

  // ── Disponibilidades ──────────────────────────────────────────────────
  if (method === 'GET' && url === '/api/comercial/disponibilidade') {
    writeJson(res, 200, { ok: true, disponibilidades: await repo.listDisponibilidades() }, corsOrigin)
    return true
  }

  if (method === 'POST' && url === '/api/comercial/disponibilidade') {
    const body = await readJson<Record<string, unknown>>(req)
    const disponibilidade = await repo.saveDisponibilidade(body)
    writeJson(res, 200, { ok: true, disponibilidade }, corsOrigin)
    return true
  }

  const dispIdMatch = url.match(/^\/api\/comercial\/disponibilidade\/([^/]+)$/)
  if (method === 'PATCH' && dispIdMatch) {
    const body = await readJson<{ ativo: boolean }>(req)
    await repo.toggleDisponibilidade(dispIdMatch[1], body.ativo)
    writeJson(res, 200, { ok: true }, corsOrigin)
    return true
  }

  // ── Indisponibilidades ────────────────────────────────────────────────
  if (method === 'GET' && url === '/api/comercial/indisponibilidade') {
    writeJson(res, 200, { ok: true, indisponibilidades: await repo.listIndisponibilidades() }, corsOrigin)
    return true
  }

  if (method === 'POST' && url === '/api/comercial/indisponibilidade') {
    const body = await readJson<Record<string, unknown>>(req)
    const indisponibilidade = await repo.saveIndisponibilidade(body)
    writeJson(res, 200, { ok: true, indisponibilidade }, corsOrigin)
    return true
  }

  const indispIdMatch = url.match(/^\/api\/comercial\/indisponibilidade\/([^/]+)$/)
  if (method === 'PATCH' && indispIdMatch) {
    const body = await readJson<{ ativo: boolean }>(req)
    await repo.toggleIndisponibilidade(indispIdMatch[1], body.ativo)
    writeJson(res, 200, { ok: true }, corsOrigin)
    return true
  }

  // ── Batch operations ──────────────────────────────────────────────────
  if (method === 'POST' && url === '/api/comercial/import-safeweb-jobs') {
    const body = await readJson<{
      clientes: Record<string, unknown>[]
      vendas: Record<string, unknown>[]
      currentUserId: string
      pontoPadrao: string
      linhas: number
    }>(req)

    if (!body.currentUserId || !body.pontoPadrao) {
      writeJson(res, 400, { ok: false, error: 'Usuário logado e ponto de atendimento padrão são obrigatórios para importar.' }, corsOrigin)
      return true
    }

    const id = randomUUID()
    const now = new Date().toISOString()
    const job: SafewebImportJob = {
      id,
      status: 'queued',
      message: 'Importação adicionada à esteira do backend.',
      progress: { current: 0, total: (body.clientes ?? []).length + (body.vendas ?? []).length },
      result: null,
      error: null,
      createdAt: now,
      updatedAt: now,
    }
    safewebImportJobs.set(id, job)

    setTimeout(() => {
      void processSafewebImportJob(id, repo, renovacaoRepo, {
        clientes: body.clientes ?? [],
        vendas: body.vendas ?? [],
        currentUserId: body.currentUserId,
        pontoPadrao: body.pontoPadrao,
        linhas: Number(body.linhas ?? 0),
      })
    }, 0)

    writeJson(res, 202, { ok: true, job }, corsOrigin)
    return true
  }

  const safewebJobMatch = url.match(/^\/api\/comercial\/import-safeweb-jobs\/([^/]+)$/)
  if (method === 'GET' && safewebJobMatch) {
    const job = safewebImportJobs.get(safewebJobMatch[1])
    writeJson(res, job ? 200 : 404, { ok: Boolean(job), job: job ?? null }, corsOrigin)
    return true
  }

  if (method === 'POST' && url === '/api/comercial/clientes/batch-import') {
    const body = await readJson<{ payloads: Record<string, unknown>[]; dryRunCheckOnly?: boolean }>(req)
    const payloads = body.payloads ?? []
    if (body.dryRunCheckOnly) {
      const cpfs = payloads.map(p => p.cpf_cnpj as string).filter(Boolean)
      const existing = await repo.getExistingCpfs(cpfs)
      writeJson(res, 200, { ok: true, existing }, corsOrigin)
    } else {
      const result = await repo.batchUpsertCadastros(payloads)
      writeJson(res, 200, { ok: true, ...result }, corsOrigin)
    }
    return true
  }

  if (method === 'POST' && url === '/api/comercial/vendas/batch-update') {
    const body = await readJson<{ updates: { protocolo_numero: string; [key: string]: unknown }[] }>(req)
    const result = await repo.batchUpdateVendasByProtocolo(body.updates ?? [])
    const renovacoesConvertidas = renovacaoRepo
      ? await renovacaoRepo.reconcileConvertedFromSales().catch(err => {
          console.error('[catalog] reconcileConvertedFromSales failed', err)
          return 0
        })
      : 0
    writeJson(res, 200, { ok: true, ...result, renovacoesConvertidas }, corsOrigin)
    return true
  }

  if (method === 'PATCH' && url.match(/^\/api\/comercial\/vendas\/([^/]+)\/status$/)) {
    const match = url.match(/^\/api\/comercial\/vendas\/([^/]+)\/status$/)!
    const body = await readJson<{ status: string }>(req)
    await repo.updateVendaStatusById(match[1], body.status)
    writeJson(res, 200, { ok: true }, corsOrigin)
    return true
  }

  if (method === 'PATCH' && url.match(/^\/api\/comercial\/agendamentos\/([^/]+)\/status$/)) {
    const match = url.match(/^\/api\/comercial\/agendamentos\/([^/]+)\/status$/)!
    const body = await readJson<{ status: string }>(req)
    await repo.updateAgendamentoValidacaoStatus(match[1], body.status)
    writeJson(res, 200, { ok: true }, corsOrigin)
    return true
  }

  if (method === 'POST' && url === '/api/comercial/agendamentos/legacy') {
    writeJson(res, 200, { ok: true, id: null, info: 'tabela legada nao existe no backend; ignore se agenda_validacao foi usada' }, corsOrigin)
    return true
  }

  // ── Titulares ─────────────────────────────────────────────────────────
  if (method === 'POST' && url === '/api/titulares') {
    const body = await readJson<Record<string, unknown>>(req)
    const titular = await repo.upsertTitular(body)
    writeJson(res, 200, { ok: true, titular }, corsOrigin)
    return true
  }

  // ── Vendas extras ─────────────────────────────────────────────────────
  const vendaTitularMatch = url.match(/^\/api\/comercial\/vendas\/([^/]+)\/titular$/)
  if (method === 'PATCH' && vendaTitularMatch) {
    const body = await readJson<{ titular_id: string; protocolo_numero: string }>(req)
    try {
      await repo.updateVendaTitular(vendaTitularMatch[1], body.titular_id, body.protocolo_numero)
      writeJson(res, 200, { ok: true }, corsOrigin)
    } catch (error) {
      writeJson(res, 400, { ok: false, error: error instanceof Error ? error.message : 'Falha ao atualizar protocolo.' }, corsOrigin)
    }
    return true
  }

  const vendaDeleteMatch = url.match(/^\/api\/comercial\/vendas\/([^/]+)$/)
  if (method === 'DELETE' && vendaDeleteMatch) {
    try {
      await repo.deleteVenda(vendaDeleteMatch[1])
      writeJson(res, 200, { ok: true }, corsOrigin)
    } catch (error) {
      writeJson(res, 400, { ok: false, error: error instanceof Error ? error.message : 'Falha ao excluir venda.' }, corsOrigin)
    }
    return true
  }

  // ── Vendas criar, buscar, safeweb ─────────────────────────────────────
  if (method === 'POST' && url === '/api/comercial/vendas/criar') {
    const body = await readJson<Record<string, unknown>>(req)
    const venda = await repo.createVenda(body)

    let renovacaoResult: Awaited<ReturnType<NonNullable<typeof renovacaoRepo>['handleSaleRenewal']>> | null = null
    if (renovacaoRepo && venda?.id) {
      renovacaoResult = await renovacaoRepo.handleSaleRenewal({
        cadastro_base_id: String(body.cadastro_base_id ?? ''),
        tipo_produto: String(body.tipo_produto ?? ''),
        certificado_id: body.certificado_id ? String(body.certificado_id) : null,
        cliente_nome: String(body.nome_faturamento ?? body.cliente ?? ''),
        cpf: body.documento_faturamento ? String(body.documento_faturamento) : null,
        cnpj: null,
        email: String(body.email_faturamento ?? ''),
        telefone: String(body.telefone_faturamento ?? ''),
        valor_venda: Number(body.valor_venda ?? 0),
        venda_id: String(venda.id),
        data_referencia: body.data_inicio_validade ? String(body.data_inicio_validade) : null,
      }).catch(err => {
        console.error('[catalog] handleSaleRenewal failed', err)
        return null
      })
      await renovacaoRepo.reconcileConvertedFromSales().catch(err => {
        console.error('[catalog] reconcileConvertedFromSales after create failed', err)
        return 0
      })
    }

    writeJson(res, 200, { ok: true, venda, renovacao: renovacaoResult }, corsOrigin)
    return true
  }

  if (method === 'POST' && url === '/api/comercial/vendas/get') {
    const body = await readJson<{ id: string }>(req)
    const venda = await repo.getVendaById(body.id)
    writeJson(res, venda ? 200 : 404, { ok: !!venda, venda }, corsOrigin)
    return true
  }

  if (method === 'POST' && url === '/api/comercial/vendas/safeweb') {
    const vendas = await repo.getSafewebVendas()
    writeJson(res, 200, { ok: true, vendas }, corsOrigin)
    return true
  }

  if (method === 'POST' && url === '/api/comercial/clientes/ids') {
    const body = await readJson<{ docs: string[] }>(req)
    const clientes = await repo.getClientesByDocs(body.docs ?? [])
    writeJson(res, 200, { ok: true, clientes }, corsOrigin)
    return true
  }

  // ── Agenda: por venda + criar pendente ────────────────────────────────
  if (method === 'POST' && url === '/api/comercial/agenda/venda') {
    const body = await readJson<{ vendaId: string }>(req)
    const agenda = await repo.getAgendaByVenda(body.vendaId)
    writeJson(res, 200, { ok: true, agenda }, corsOrigin)
    return true
  }

  if (method === 'POST' && url === '/api/comercial/agenda/pendente') {
    const body = await readJson<Record<string, unknown>>(req)
    const agenda = await repo.createAgendaPendente(body)
    writeJson(res, 200, { ok: true, agenda }, corsOrigin)
    return true
  }

  // ── Titulares por CPF ─────────────────────────────────────────────────
  if (method === 'POST' && url === '/api/titulares/por-cpf') {
    const body = await readJson<{ cpf: string }>(req)
    const titular = await repo.getTitularByCpf(body.cpf)
    writeJson(res, 200, { ok: true, titular }, corsOrigin)
    return true
  }

  // ── Vendas extras ─────────────────────────────────────────────────────
  if (method === 'POST' && url === '/api/comercial/vendas/protocolos') {
    const body = await readJson<{ protocolos: string[] }>(req)
    const protocolos = await repo.getExistingProtocolos(body.protocolos ?? [])
    writeJson(res, 200, { ok: true, protocolos }, corsOrigin)
    return true
  }

  if (method === 'GET' && url === '/api/comercial/vendas/count-sem-validacao') {
    const count = await repo.countVendasEmitidosSemValidacao()
    writeJson(res, 200, { ok: true, count }, corsOrigin)
    return true
  }

  // ── NFS-e emitidas (stub — tabela não existe no backend ainda) ─────────
  if (url.startsWith('/api/nfse/')) {
    writeJson(res, 501, { ok: false, error: 'NFS-e ainda não migrada para o backend local' }, corsOrigin)
    return true
  }

  return false
}
