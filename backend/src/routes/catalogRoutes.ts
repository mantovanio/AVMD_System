import type { IncomingMessage, ServerResponse } from 'node:http'
import { readJson, writeJson } from '../utils/http.js'
import { CatalogRepository } from '../repositories/catalogRepository.js'
import { RenovacaoRepository } from '../repositories/renovacaoRepository.js'

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
    writeJson(res, 200, { ok: true, ...result }, corsOrigin)
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

    if (renovacaoRepo && venda?.id) {
      void renovacaoRepo.handleSaleRenewal({
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
      }).catch(err => console.error('[catalog] handleSaleRenewal failed', err))
    }

    writeJson(res, 200, { ok: true, venda }, corsOrigin)
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
