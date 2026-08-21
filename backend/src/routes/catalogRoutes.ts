import type { IncomingMessage, ServerResponse } from 'node:http'
import { randomUUID } from 'node:crypto'
import { createSecureContext } from 'node:tls'
import { execFile } from 'node:child_process'
import { access, chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { extname, join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { readJson, writeJson } from '../utils/http.js'
import { CatalogRepository } from '../repositories/catalogRepository.js'
import { RenovacaoRepository } from '../repositories/renovacaoRepository.js'
import type { AivenSqlClient } from '../db/aivenClient.js'
import type { BackendConfig } from '../config/env.js'
import type { ProfileRepository } from '../repositories/profileRepository.js'
import { requireAdmin } from '../utils/authMiddleware.js'

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
const ISABELLA_VIDAL_PROFILE_ID = 'ad3436f8-eb15-4fbe-a351-3b6b56d2a17e'
const execFileAsync = promisify(execFile)
const NFSE_CERT_STORAGE_DIR = resolve('storage/certificados-digitais')
const NFSE_STORAGE_ROOT = resolve('storage')

function isFilled(value: unknown) {
  return String(value ?? '').trim().length > 0
}

function extractStringRecord(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function sanitizeNfseConfig(config: Record<string, unknown> | null) {
  if (!config) return null
  return {
    ...config,
    senha_prefeitura: config.senha_prefeitura ? '********' : null,
    chave_autenticacao: config.chave_autenticacao ? '********' : null,
    certificado_senha: config.certificado_senha ? '********' : null,
  }
}

function buildNfseRequiredChecks(config: Record<string, unknown>) {
  const payload = extractStringRecord(config.payload_reforma_tributaria)
  const certPath = String(config.certificado_pfx_path ?? '').trim().replace(/\\/g, '/')
  return {
    emitente_vinculado: isFilled(config.cadastro_base_emitente_id) && isFilled(config.cnpj_emitente),
    inscricao_municipal: isFilled(config.inscricao_municipal),
    codigo_servico: isFilled(config.codigo_servico_municipio),
    aliquota_iss: Number(config.aliquota_iss ?? 0) > 0,
    serie_rps: isFilled(config.serie_rps),
    certificado_a1: isFilled(certPath) && isFilled(config.certificado_senha),
    credencial_prefeitura: isFilled(config.usuario_prefeitura) || isFilled(config.chave_autenticacao),
    wsdl_configurado: isFilled(payload.ginfes_wsdl_homologacao) || isFilled(payload.gissonline_wsdl_url),
  }
}

async function certificateFileExists(relativePath: unknown) {
  const certPath = String(relativePath ?? '').trim().replace(/\\/g, '/')
  if (!certPath || certPath.includes('..') || certPath.startsWith('/')) return false
  const candidates = [
    resolve(NFSE_CERT_STORAGE_DIR, certPath),
    certPath.startsWith('certificados-digitais/')
      ? resolve(NFSE_STORAGE_ROOT, certPath)
      : null,
    certPath.startsWith('storage/certificados-digitais/')
      ? resolve(certPath)
      : null,
  ].filter((value): value is string => Boolean(value))

  for (const absolutePath of candidates) {
    try {
      if (!absolutePath.startsWith(NFSE_STORAGE_ROOT)) continue
      await access(absolutePath)
      return true
    } catch {
      continue
    }
  }

  return false
}

async function validatePfxWithOpenSsl(pfx: Buffer, senha: string) {
  const dir = await mkdtemp(join(tmpdir(), 'avmd-pfx-'))
  const file = join(dir, 'certificado.pfx')
  try {
    await writeFile(file, pfx)
    const baseOptions = {
      timeout: 20000,
      env: { ...process.env, AVMD_PFX_PASS: senha },
    }
    try {
      await execFileAsync('openssl', ['pkcs12', '-in', file, '-noout', '-passin', 'env:AVMD_PFX_PASS'], baseOptions)
      return { ok: true, legacy: false }
    } catch (firstError) {
      await execFileAsync('openssl', ['pkcs12', '-legacy', '-in', file, '-noout', '-passin', 'env:AVMD_PFX_PASS'], baseOptions)
      return {
        ok: true,
        legacy: true,
        warning: firstError instanceof Error ? firstError.message : null,
      }
    }
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined)
  }
}

async function validatePfx(pfx: Buffer, senha: string) {
  try {
    createSecureContext({ pfx, passphrase: senha })
    return { metodo_validacao: 'node_tls', aviso: null as string | null }
  } catch {
    const opensslResult = await validatePfxWithOpenSsl(pfx, senha)
    return {
      metodo_validacao: opensslResult.legacy ? 'openssl_legacy' : 'openssl',
      aviso: opensslResult.legacy
        ? 'Certificado validado em modo compatível. Isso é comum em A1 emitido com algoritmo legado.'
        : null,
    }
  }
}

function normalizeCertExtension(filename: string) {
  const ext = extname(filename).toLowerCase()
  return ext === '.p12' ? '.p12' : '.pfx'
}

function updateSafewebJob(id: string, patch: Partial<Omit<SafewebImportJob, 'id' | 'createdAt'>>) {
  const current = safewebImportJobs.get(id)
  if (!current) return
  safewebImportJobs.set(id, { ...current, ...patch, updatedAt: new Date().toISOString() })
}

function serializeImportJob(row: Record<string, unknown> | null): SafewebImportJob | null {
  if (!row) return null
  return {
    id: String(row.id),
    status: String(row.status ?? 'queued') as SafewebImportJob['status'],
    message: String(row.message ?? ''),
    progress: {
      current: Number(row.progress_current ?? 0),
      total: Number(row.progress_total ?? 0),
    },
    result: row.result && Object.keys(row.result as Record<string, unknown>).length
      ? row.result as SafewebImportJob['result']
      : null,
    error: row.error ? String(row.error) : null,
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? new Date().toISOString()),
  }
}

function isSafewebBhSale(venda: Record<string, unknown>) {
  const metadata = venda.metadata as Record<string, unknown> | null
  const safeweb = metadata?.safeweb_financeiro as Record<string, unknown> | undefined
  const atendimento = safeweb?.atendimento as Record<string, unknown> | undefined
  const cidade = String(atendimento?.cidade ?? '').toLowerCase()
  const local = String(atendimento?.nome_local ?? '').toLowerCase()
  const apelido = String(atendimento?.apelido_local ?? '').toLowerCase()
  return cidade.includes('belo horizonte')
    || local.includes('belo horizonte')
    || apelido.includes('belo horizonte')
    || local.includes('prado - calcedonia')
    || apelido.includes('prado - calcedonia')
}

function applySafewebCommercialOwnership(venda: Record<string, unknown>) {
  if (!isSafewebBhSale(venda)) return venda
  return {
    ...venda,
    vendedor_id: ISABELLA_VIDAL_PROFILE_ID,
    agente_registro_id: ISABELLA_VIDAL_PROFILE_ID,
  }
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
  const setJob = async (patch: Partial<Omit<SafewebImportJob, 'id' | 'createdAt'>>) => {
    updateSafewebJob(id, patch)
    await repo.updateImportJob(id, {
      status: patch.status,
      message: patch.message,
      progressCurrent: patch.progress?.current,
      progressTotal: patch.progress?.total,
      result: patch.result,
      error: patch.error,
      startedAtNow: patch.status === 'running',
      finishedAtNow: patch.status === 'done' || patch.status === 'failed',
    })
  }

  try {
    await setJob({
      status: 'running',
      message: 'Importando clientes no backend...',
      progress: { current: 0, total: input.clientes.length + input.vendas.length },
    })

    for (let i = 0; i < input.clientes.length; i += batchSize) {
      const batch = input.clientes.slice(i, i + batchSize)
      await repo.batchUpsertCadastros(batch)
      await setJob({
        message: `Clientes importados: ${Math.min(i + batch.length, input.clientes.length)} de ${input.clientes.length}.`,
        progress: { current: Math.min(i + batch.length, input.clientes.length), total: input.clientes.length + input.vendas.length },
      })
    }

    const docs = input.clientes.map(item => String(item.cpf_cnpj ?? '')).filter(Boolean)
    const clientes = await repo.getClientesByDocs(docs)
    const idByDoc = new Map(clientes.map(item => [item.cpf_cnpj, item.id]))

    const vendas: Record<string, unknown>[] = input.vendas.map(venda => {
      const doc = String(venda.documento_faturamento ?? '').replace(/\D/g, '')
      return applySafewebCommercialOwnership({
        ...venda,
        cadastro_base_id: venda.cadastro_base_id ?? idByDoc.get(doc) ?? null,
      })
    })

    await setJob({
      message: 'Verificando protocolos existentes...',
      progress: { current: input.clientes.length, total: input.clientes.length + vendas.length },
    })

    const existentes = await repo.getExistingVendaIdentities(vendas.map(venda => ({
      protocolo_numero: String(venda.protocolo_numero ?? '').trim(),
      pedido_numero: String(venda.pedido_numero ?? '').trim(),
    })))
    const protocoloSet = new Set(existentes.map(item => String(item.protocolo_numero ?? '')).filter(Boolean))
    const pedidoSet = new Set(existentes.map(item => String(item.pedido_numero ?? '')).filter(Boolean))
    const paraAtualizar = vendas.filter(venda =>
      protocoloSet.has(String(venda.protocolo_numero ?? '').trim())
      || pedidoSet.has(String(venda.pedido_numero ?? '').trim())
    )
    const paraCriar = vendas.filter(venda =>
      !protocoloSet.has(String(venda.protocolo_numero ?? '').trim())
      && !pedidoSet.has(String(venda.pedido_numero ?? '').trim())
    )

    let precisaConciliarRenovacoes = false

    for (let i = 0; i < paraAtualizar.length; i += batchSize) {
      const batch = paraAtualizar.slice(i, i + batchSize) as unknown as { protocolo_numero: string; [key: string]: unknown }[]
      const result = await repo.batchUpdateVendasByIdentity(batch)
      atualizados += result.updated
      precisaConciliarRenovacoes = true
      await setJob({
        message: `Pedidos atualizados: ${Math.min(i + batch.length, paraAtualizar.length)} de ${paraAtualizar.length}.`,
        progress: { current: input.clientes.length + Math.min(i + batch.length, paraAtualizar.length), total: input.clientes.length + vendas.length },
      })
    }

    for (const venda of paraCriar) {
      const created = await repo.createVenda({
        ...venda,
        quantidade: 1,
        vendedor_id: venda.vendedor_id ?? input.currentUserId,
        agente_registro_id: venda.agente_registro_id ?? null,
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

      await setJob({
        message: `Pedidos criados: ${criados} de ${paraCriar.length}.`,
        progress: { current: input.clientes.length + paraAtualizar.length + criados, total: input.clientes.length + vendas.length },
      })
    }

    if (renovacaoRepo && precisaConciliarRenovacoes) {
      await setJob({
        message: 'Conciliando renovações com as vendas importadas...',
        progress: { current: input.clientes.length + vendas.length, total: input.clientes.length + vendas.length },
      })
      try {
        renovacoesConvertidas += await renovacaoRepo.reconcileConvertedFromSales()
      } catch (error) {
        console.error('[catalog] reconcileConvertedFromSales import job skipped:', error)
        await setJob({
          message: 'Vendas importadas. A conciliação de renovações demorou demais e será reprocessada depois.',
          progress: { current: input.clientes.length + vendas.length, total: input.clientes.length + vendas.length },
        })
      }
    }

    const divergentes = await repo.countVendasEmitidosSemValidacao()
    await setJob({
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
    await setJob({
      status: 'failed',
      message: 'Importação falhou.',
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

async function persistBackendEnvironment(updates: Record<string, string>) {
  const candidates = [resolve('backend/.env.local'), resolve('.env.local')]
  let envPath = candidates[0]
  for (const candidate of candidates) {
    try {
      await access(candidate)
      envPath = candidate
      break
    } catch { /* tenta o próximo caminho */ }
  }
  const current = await readFile(envPath, 'utf8').catch(() => '')
  const remaining = new Map(Object.entries(updates))
  const lines = current.split(/\r?\n/).map(line => {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=/)
    if (!match || !remaining.has(match[1])) return line
    const value = remaining.get(match[1]) ?? ''
    remaining.delete(match[1])
    return `${match[1]}=${JSON.stringify(value)}`
  })
  for (const [key, value] of remaining) lines.push(`${key}=${JSON.stringify(value)}`)
  // O diretório do backend é protegido contra escrita para impedir que o
  // usuário do serviço crie arquivos arbitrários. O arquivo já existente é
  // gravável pelo próprio serviço e pode ser atualizado sem criar um .tmp.
  await writeFile(envPath, lines.join('\n').replace(/\n+$/, '') + '\n', { encoding: 'utf8', mode: 0o600 })
  await chmod(envPath, 0o600).catch(() => undefined)
}

export async function handleCatalogRoutes(req: IncomingMessage, res: ServerResponse, repo: CatalogRepository, renovacaoRepo: RenovacaoRepository | null, db: AivenSqlClient, corsOrigin: string, config: BackendConfig, profileRepository: ProfileRepository): Promise<boolean> {
  const method = req.method ?? ''
  const url = req.url ?? ''
  const requestUrl = new URL(url, 'http://localhost')
  const pathname = requestUrl.pathname

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
      files?: { fileName: string; fileType?: string; rowsCount: number }[]
    }>(req)

    if (!body.currentUserId || !body.pontoPadrao) {
      writeJson(res, 400, { ok: false, error: 'Usuário logado e ponto de atendimento padrão são obrigatórios para importar.' }, corsOrigin)
      return true
    }

    const id = randomUUID()
    const now = new Date().toISOString()
    const totalProgress = (body.clientes ?? []).length + (body.vendas ?? []).length
    const files = (body.files?.length ? body.files : [{ fileName: 'arquivo_importado', fileType: 'safeweb', rowsCount: Number(body.linhas ?? 0) }])
    const job: SafewebImportJob = {
      id,
      status: 'queued',
      message: 'Importação adicionada à esteira do backend.',
      progress: { current: 0, total: totalProgress },
      result: null,
      error: null,
      createdAt: now,
      updatedAt: now,
    }
    safewebImportJobs.set(id, job)
    await repo.createImportJob({
      id,
      tipo: 'safeweb_financeiro',
      createdBy: body.currentUserId,
      totalFiles: files.length,
      totalRows: Number(body.linhas ?? 0),
      progressTotal: totalProgress,
      message: 'Importação adicionada à esteira do backend.',
    })
    for (const file of files) {
      await repo.addImportJobFile({
        jobId: id,
        fileName: file.fileName,
        fileType: file.fileType ?? null,
        rowsCount: Number(file.rowsCount ?? 0),
        rowsJson: { rowsCount: file.rowsCount },
      })
    }

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
    const persisted = await repo.getImportJob(safewebJobMatch[1]).catch(() => null)
    const job = serializeImportJob(persisted) ?? safewebImportJobs.get(safewebJobMatch[1])
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
    try {
      const body = await readJson<Record<string, unknown>>(req)
      const titular = await repo.upsertTitular(body)
      writeJson(res, 200, { ok: true, titular }, corsOrigin)
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      console.error('[catalog] upsertTitular error:', msg)
      writeJson(res, 500, { ok: false, error: 'Erro ao salvar titular: ' + msg }, corsOrigin)
    }
    return true
  }

  // ── Gerar Protocolo (Senha Digital Plus) ──────────────────────────────
  if (method === 'POST' && url === '/api/protocolos/validar-representante') {
    const body = await readJson<{ cnpj?: string; cpf?: string; nome?: string }>(req)
    const cnpj = String(body.cnpj ?? '').replace(/\D/g, '')
    const cpf = String(body.cpf ?? '').replace(/\D/g, '')
    const nome = String(body.nome ?? '').trim()
    if (cnpj.length !== 14 || cpf.length !== 11 || !nome) {
      writeJson(res, 400, { ok: false, error: 'Informe CNPJ, CPF e nome completo do representante.' }, corsOrigin)
      return true
    }

    try {
      const receitaRes = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, {
        headers: { Accept: 'application/json', 'User-Agent': 'AVMD-System/1.0' },
      })
      const receita = await receitaRes.json().catch(() => null) as Record<string, unknown> | null
      if (!receitaRes.ok || !receita) {
        writeJson(res, 502, { ok: false, error: 'Não foi possível consultar o QSA na Receita Federal.' }, corsOrigin)
        return true
      }

      const matchesMaskedDocument = (masked: unknown) => {
        const value = String(masked ?? '').replace(/[^\d*]/g, '')
        if (value.length !== cpf.length) return false
        return [...value].every((char, index) => char === '*' || char === cpf[index])
      }
      const normalize = (value: unknown) => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
      const authorizedRole = (value: unknown) => /administrador|diretor|presidente|titular|empresari|representante|responsavel/.test(normalize(value))
      const qsa = Array.isArray(receita.qsa) ? receita.qsa as Record<string, unknown>[] : []
      const match = qsa.find(member => {
        const socioMatch = matchesMaskedDocument(member.cnpj_cpf_do_socio)
        const representanteMatch = matchesMaskedDocument(member.cpf_representante_legal)
        const registeredName = normalize(member.nome_representante_legal || member.nome_socio)
        const nameMatch = registeredName === normalize(nome)
        return nameMatch && (representanteMatch || (socioMatch && authorizedRole(member.qualificacao_socio)))
      })
      const validatedAt = new Date().toISOString()
      if (!match) {
        writeJson(res, 422, {
          ok: false,
          vinculo_confirmado: false,
          error: 'O CPF informado não consta no QSA público como representante legal ou administrador deste CNPJ.',
          razao_social: receita.razao_social ?? null,
          situacao_cadastral: receita.descricao_situacao_cadastral ?? null,
          fonte: 'BrasilAPI / dados públicos da Receita Federal',
          validado_em: validatedAt,
        }, corsOrigin)
        return true
      }

      writeJson(res, 200, {
        ok: true,
        vinculo_confirmado: true,
        razao_social: receita.razao_social ?? null,
        situacao_cadastral: receita.descricao_situacao_cadastral ?? null,
        representante_nome: match.nome_representante_legal || match.nome_socio || null,
        qualificacao: match.qualificacao_representante_legal || match.qualificacao_socio || null,
        fonte: 'BrasilAPI / dados públicos da Receita Federal',
        validado_em: validatedAt,
      }, corsOrigin)
    } catch (error) {
      writeJson(res, 502, { ok: false, error: 'Falha ao consultar a Receita Federal: ' + (error instanceof Error ? error.message : String(error)) }, corsOrigin)
    }
    return true
  }

  if (method === 'POST' && url === '/api/protocolos/gerar') {
    try {
      const body = await readJson<Record<string, unknown>>(req)

      if (!config.senhaDigitalPlusApiKey || !config.senhaDigitalPlusSecretKey) {
        writeJson(res, 500, { ok: false, error: 'Credenciais da Senha Digital Plus não configuradas no servidor.' }, corsOrigin)
        return true
      }

      const digits = (value: unknown) => String(value ?? '').replace(/\D/g, '')
      const text = (value: unknown) => String(value ?? '').trim()
      const object = (value: unknown) => value && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : {}
      const cnpj = digits(body.CNPJ)
      const isPJ = cnpj.length === 14
      const titular = object(body.Titular)
      const cpf = digits(isPJ ? titular.CPF : body.CPF)
      const contato = object(body.Contato)
      const endereco = object(body.Endereco)
      const titularContato = object(titular.Contato)
      const titularEndereco = object(titular.Endereco)

      const sdpHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
        'x-api-key': config.senhaDigitalPlusApiKey,
        'x-secret-key': config.senhaDigitalPlusSecretKey,
        'x-environment': config.senhaDigitalPlusEnvironment || 'sandbox',
      }
      let idProduto = text(body.idProduto)
      let categoriaProduto = text(body.categoriaProduto)
      let nomeProduto = text(body.produto)
      let descricaoProduto = text(body.ProdutoDescricao)

      // Catálogos antigos não possuem os IDs SDP em metadata. Nessa situação,
      // resolve os identificadores no catálogo oficial antes de validar/enviar o
      // protocolo. Assim, vendas já existentes também podem ser emitidas.
      if (!idProduto || !categoriaProduto) {
        type SdpCategoria = { id?: unknown; nome?: unknown }
        type SdpIdentificador = { tipoEmissao?: unknown; codigo?: unknown }
        type SdpProduto = { nome?: unknown; categoria?: unknown; identificadores?: unknown }
        const normalize = (value: unknown) => text(value)
          .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
        const productHint = normalize(`${nomeProduto} ${descricaoProduto}`)
        const categoriesRes = await fetch(`${config.senhaDigitalPlusApiUrl}/produtos/categoria`, {
          method: 'GET', headers: sdpHeaders,
        })
        const categories = await categoriesRes.json().catch(() => []) as SdpCategoria[]
        const preferredCategoryNames = productHint.includes('cnpj') || productHint.includes('e-pj')
          ? ['e-cnpj', 'e-pj']
          : productHint.includes('cpf') || productHint.includes('e-pf')
            ? ['e-cpf', 'e-pf']
            : []

        for (const categoryName of preferredCategoryNames) {
          const category = Array.isArray(categories)
            ? categories.find(item => normalize(item.nome) === categoryName)
            : undefined
          const categoryId = text(category?.id)
          if (!categoryId) continue
          const productsRes = await fetch(`${config.senhaDigitalPlusApiUrl}/produtos/${encodeURIComponent(categoryId)}`, {
            method: 'GET', headers: sdpHeaders,
          })
          const products = await productsRes.json().catch(() => []) as SdpProduto[]
          if (!productsRes.ok || !Array.isArray(products) || !products.length) continue

          const wantsA1 = /\ba1\b/.test(productHint)
          const wantsA3 = /\ba3\b/.test(productHint)
          const wantsTwoYears = /2\s*anos|24\s*meses/.test(productHint)
          const ranked = products.map(product => {
            const candidate = normalize(product.nome)
            let score = 0
            if (wantsA1 === /\ba1\b/.test(candidate)) score += 100
            if (wantsA3 === /\ba3\b/.test(candidate)) score += 100
            if (wantsTwoYears === /2\s*anos|24\s*meses/.test(candidate)) score += 30
            if (productHint.includes('sem midia') && candidate.includes('sem midia')) score += 10
            return { product, score }
          }).sort((a, b) => b.score - a.score)
          const selected = ranked[0]?.product
          const emissionName = text(body.tipoEmissao) === '1' ? 'presencial'
            : text(body.tipoEmissao) === '3' ? 'videoconferencia' : 'online'
          const identifiers = Array.isArray(selected?.identificadores)
            ? selected.identificadores as SdpIdentificador[] : []
          const identifier = identifiers.find(item => normalize(item.tipoEmissao) === emissionName)
          const resolvedId = text(identifier?.codigo)
          if (!resolvedId) continue

          idProduto ||= resolvedId
          categoriaProduto ||= text(selected?.categoria) || categoryId
          nomeProduto ||= text(selected?.nome)
          descricaoProduto ||= text(selected?.nome)
          break
        }
      }

      if (isPJ) {
        const receitaRes = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, {
          headers: { Accept: 'application/json', 'User-Agent': 'AVMD-System/1.0' },
        })
        const receita = await receitaRes.json().catch(() => null) as Record<string, unknown> | null
        const qsa = Array.isArray(receita?.qsa) ? receita.qsa as Record<string, unknown>[] : []
        const matchesCpf = (masked: unknown) => {
          const value = String(masked ?? '').replace(/[^\d*]/g, '')
          return value.length === cpf.length && [...value].every((char, index) => char === '*' || char === cpf[index])
        }
        const normalize = (value: unknown) => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
        const authorized = (value: unknown) => /administrador|diretor|presidente|titular|empresari|representante|responsavel/.test(normalize(value))
        const titularName = normalize(titular.Nome)
        const linked = qsa.some(member => {
          const registeredName = normalize(member.nome_representante_legal || member.nome_socio)
          return registeredName === titularName && (matchesCpf(member.cpf_representante_legal)
            || (matchesCpf(member.cnpj_cpf_do_socio) && authorized(member.qualificacao_socio)))
        })
        if (!receitaRes.ok || !linked) {
          writeJson(res, 422, {
            ok: false,
            error: 'Emissão bloqueada: o vínculo entre CNPJ e CPF não foi confirmado no QSA público da Receita Federal.',
          }, corsOrigin)
          return true
        }
      }

      const required: Array<[string, unknown]> = [
        ['tipoEmissao', body.tipoEmissao], ['idProduto', idProduto],
        ['categoriaProduto', categoriaProduto], ['produto', nomeProduto],
        ['ProdutoDescricao', descricaoProduto], ['Contato.DDD', contato.DDD],
        ['Contato.Telefone', contato.Telefone], ['Contato.Email', contato.Email],
        ['Endereco.CodigoIbgeMunicipio', endereco.CodigoIbgeMunicipio],
        ['Endereco.CodigoIbgeUF', endereco.CodigoIbgeUF], ['Endereco.cep', endereco.cep],
        ['Endereco.cidade', endereco.cidade], ['Endereco.bairro', endereco.bairro],
        ['Endereco.logradouro', endereco.logradouro], ['Endereco.numero', endereco.numero],
        ['Endereco.uf', endereco.uf],
      ]
      if (isPJ) {
        required.push(
          ['CNPJ', cnpj], ['RazaoSocial', body.RazaoSocial], ['Titular.CPF', cpf],
          ['Titular.DataNascimento', titular.DataNascimento], ['Titular.Nome', titular.Nome],
          ['Titular.Contato.DDD', titularContato.DDD], ['Titular.Contato.Telefone', titularContato.Telefone],
          ['Titular.Contato.Email', titularContato.Email], ['Titular.Endereco.CodigoIbgeMunicipio', titularEndereco.CodigoIbgeMunicipio],
          ['Titular.Endereco.CodigoIbgeUF', titularEndereco.CodigoIbgeUF], ['Titular.Endereco.cep', titularEndereco.cep],
          ['Titular.Endereco.cidade', titularEndereco.cidade], ['Titular.Endereco.bairro', titularEndereco.bairro],
          ['Titular.Endereco.logradouro', titularEndereco.logradouro], ['Titular.Endereco.numero', titularEndereco.numero],
          ['Titular.Endereco.uf', titularEndereco.uf],
        )
      } else {
        required.push(['CPF', cpf], ['DataNascimento', body.DataNascimento], ['Nome', body.Nome])
      }
      const missing = required.filter(([, value]) => !text(value)).map(([field]) => field)
      if (cpf.length !== 11 || missing.length) {
        writeJson(res, 400, {
          ok: false,
          error: `Dados obrigatórios inválidos para protocolo ${isPJ ? 'PJ' : 'PF'}: ${missing.join(', ') || 'CPF'}.`,
        }, corsOrigin)
        return true
      }

      const commonPayload = {
        tipoEmissao: text(body.tipoEmissao), idProduto,
        categoriaProduto, produto: nomeProduto,
        ProdutoDescricao: descricaoProduto, Contato: contato, Endereco: endereco,
      }
      const sdpPayload: Record<string, unknown> = isPJ
        ? { ...commonPayload, CNPJ: cnpj, RazaoSocial: text(body.RazaoSocial), Titular: { ...titular, CPF: cpf } }
        : { ...commonPayload, CPF: cpf, DataNascimento: text(body.DataNascimento), Nome: text(body.Nome), CEI: text(body.CEI), CAEPF: text(body.CAEPF), NIS: text(body.NIS) }

      const sdpRes = await fetch(`${config.senhaDigitalPlusApiUrl}/protocolo/capture-certificate`, {
        method: 'POST',
        headers: sdpHeaders,
        body: JSON.stringify(sdpPayload),
      })

      const sdpData = await sdpRes.json().catch(() => null) as Record<string, unknown> | null

      if (!sdpRes.ok) {
        const msg = (sdpData as Record<string, unknown>)?.message || `Erro HTTP ${sdpRes.status}`
        console.error('[catalog] Senha Digital Plus API error:', sdpRes.status, msg)
        writeJson(res, 502, { ok: false, error: 'Erro na API Senha Digital Plus: ' + String(msg) }, corsOrigin)
        return true
      }

      // A SDP (ambiente sandbox) devolve o link do protocolo com um host que
      // não resolve publicamente (ex.: sandbox.safeweb.com.br). Reescrevemos o
      // host para o portal configurado, preservando path e query.
      if (sdpData && typeof sdpData === 'object') {
        const rw = (u?: unknown): string | undefined => {
          if (typeof u !== 'string' || !u) return u as undefined
          try {
            const parsed = new URL(u)
            const base = new URL(config.senhaDigitalPlusPortalUrl)
            parsed.protocol = base.protocol
            parsed.host = base.host
            parsed.port = base.port
            return parsed.toString()
          } catch {
            return u
          }
        }
        const obj = sdpData as Record<string, unknown>
        if (obj.url !== undefined) obj.url = rw(obj.url)
        if (obj.protocolo_url !== undefined) obj.protocolo_url = rw(obj.protocolo_url)
        if (obj.protocoloUrl !== undefined) obj.protocoloUrl = rw(obj.protocoloUrl)
        if (obj.link !== undefined) obj.link = rw(obj.link)
      }

      writeJson(res, 200, { ok: true, ...sdpData }, corsOrigin)
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      console.error('[catalog] gerarProtocolo error:', msg)
      writeJson(res, 500, { ok: false, error: 'Erro ao gerar protocolo: ' + msg }, corsOrigin)
    }
    return true
  }

  // ── Listar Produtos/Categorias (Senha Digital Plus) ───────────────────
  if (method === 'PUT' && url === '/api/protocolos/config') {
    const authReq = await requireAdmin(req, res, config.clerkSecretKey, corsOrigin, profileRepository)
    if (!authReq) return true
    try {
      const body = await readJson<{ api_key?: string; secret_key?: string; ambiente?: string }>(req)
      const apiKey = String(body.api_key ?? '').trim() || config.senhaDigitalPlusApiKey
      const secretKey = String(body.secret_key ?? '').trim() || config.senhaDigitalPlusSecretKey
      const environment = body.ambiente === 'sandbox' ? 'sandbox' : 'production'
      if (!apiKey || !secretKey) {
        writeJson(res, 400, { ok: false, error: 'API Key e Secret Key são obrigatórias.' }, corsOrigin)
        return true
      }

      const validation = await fetch(`${config.senhaDigitalPlusApiUrl}/validate`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'x-api-key': apiKey,
          'x-secret-key': secretKey,
          'x-environment': environment,
        },
        signal: AbortSignal.timeout(15000),
      })
      const validationData = await validation.json().catch(() => null) as Record<string, unknown> | null
      // A resposta real da SDP pode omitir `authorized`, mas quando o campo
      // existe e vem como false a credencial foi recusada, mesmo com HTTP 200.
      if (!validation.ok || validationData?.authorized === false) {
        writeJson(res, 400, {
          ok: false,
          error: `A Senha Digital Plus recusou as credenciais no ambiente ${environment === 'production' ? 'Produção' : 'Sandbox'}: ${String(validationData?.message ?? 'não autorizado')}.`,
        }, corsOrigin)
        return true
      }

      await persistBackendEnvironment({
        SENHA_DIGITAL_PLUS_API_KEY: apiKey,
        SENHA_DIGITAL_PLUS_SECRET_KEY: secretKey,
        SENHA_DIGITAL_PLUS_ENVIRONMENT: environment,
      })
      config.senhaDigitalPlusApiKey = apiKey
      config.senhaDigitalPlusSecretKey = secretKey
      config.senhaDigitalPlusEnvironment = environment
      console.info(`[catalog] Credenciais SDP atualizadas por administrador ${authReq.auth?.userId ?? 'desconhecido'}.`)
      writeJson(res, 200, {
        ok: true,
        message: 'Credenciais validadas e armazenadas com segurança.',
        configuracao: {
          ambiente: environment,
          api_key_configurada: true,
          secret_key_configurada: true,
        },
      }, corsOrigin)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      writeJson(res, 500, { ok: false, error: `Não foi possível salvar as credenciais: ${message}` }, corsOrigin)
    }
    return true
  }

  if (method === 'GET' && url === '/api/protocolos/config') {
    writeJson(res, 200, {
      ok: true,
      configuracao: {
        api_url: config.senhaDigitalPlusApiUrl,
        portal_url: config.senhaDigitalPlusPortalUrl,
        ambiente: config.senhaDigitalPlusEnvironment,
        api_key_configurada: Boolean(config.senhaDigitalPlusApiKey),
        secret_key_configurada: Boolean(config.senhaDigitalPlusSecretKey),
      },
    }, corsOrigin)
    return true
  }

  if (method === 'GET' && url.startsWith('/api/protocolos/produtos')) {
    try {
      if (!config.senhaDigitalPlusApiKey || !config.senhaDigitalPlusSecretKey) {
        writeJson(res, 500, { ok: false, error: 'Credenciais da Senha Digital Plus não configuradas.' }, corsOrigin)
        return true
      }

      const sdpHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
        'x-api-key': config.senhaDigitalPlusApiKey,
        'x-secret-key': config.senhaDigitalPlusSecretKey,
        'x-environment': config.senhaDigitalPlusEnvironment || 'production',
      }

      const parsedUrl = new URL(req.url ?? url, 'http://localhost')
      const categoria = parsedUrl.searchParams.get('categoria')?.trim()
      const endpoint = categoria
        ? `${config.senhaDigitalPlusApiUrl}/produtos/${encodeURIComponent(categoria)}`
        : `${config.senhaDigitalPlusApiUrl}/produtos/categoria`
      const catRes = await fetch(endpoint, {
        method: 'GET',
        headers: sdpHeaders,
      })
      const resultado = await catRes.json().catch(() => []) as unknown[]

      writeJson(res, catRes.ok ? 200 : catRes.status, categoria
        ? { ok: catRes.ok, produtos: resultado }
        : { ok: catRes.ok, categorias: resultado }, corsOrigin)
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      console.error('[catalog] listarProdutos error:', msg)
      writeJson(res, 500, { ok: false, error: 'Erro ao listar produtos: ' + msg }, corsOrigin)
    }
    return true
  }

  // ── Validar Credenciais (Senha Digital Plus) ──────────────────────────
  if (method === 'POST' && url === '/api/protocolos/validate') {
    const authReq = await requireAdmin(req, res, config.clerkSecretKey, corsOrigin, profileRepository)
    if (!authReq) return true
    try {
      if (!config.senhaDigitalPlusApiKey || !config.senhaDigitalPlusSecretKey) {
        writeJson(res, 500, { ok: false, error: 'Credenciais da Senha Digital Plus não configuradas.' }, corsOrigin)
        return true
      }

      const sdpHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
        'x-api-key': config.senhaDigitalPlusApiKey,
        'x-secret-key': config.senhaDigitalPlusSecretKey,
        'x-environment': config.senhaDigitalPlusEnvironment || 'production',
      }

      const sdpRes = await fetch(`${config.senhaDigitalPlusApiUrl}/validate`, {
        method: 'POST',
        headers: sdpHeaders,
      })
      const sdpData = await sdpRes.json().catch(() => null) as Record<string, unknown> | null

      writeJson(res, sdpRes.ok ? 200 : 401, {
        ok: sdpRes.ok,
        ambiente: config.senhaDigitalPlusEnvironment,
        ...sdpData,
      }, corsOrigin)
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      console.error('[catalog] validateCredentials error:', msg)
      writeJson(res, 500, { ok: false, error: 'Erro ao validar credenciais: ' + msg }, corsOrigin)
    }
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

  const vendaDeleteMatch = pathname.match(/^\/api\/comercial\/vendas\/([0-9a-fA-F-]{36})$/)
  if (method === 'DELETE' && vendaDeleteMatch) {
    try {
      const adminProfileId = requestUrl.searchParams.get('admin_profile_id')
      if (!adminProfileId) {
        writeJson(res, 403, { ok: false, error: 'admin_profile_id é obrigatório para excluir vendas.' }, corsOrigin)
        return true
      }
      const adminCheck = await db.query<{ id: string }>(
        `select id from profiles
         where id = $1::uuid
           and perfil = 'admin'
           and status = 'ativo'
         limit 1`,
        [adminProfileId],
      )
      if (!adminCheck.rows[0]) {
        writeJson(res, 403, { ok: false, error: 'Apenas administradores podem excluir vendas.' }, corsOrigin)
        return true
      }
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

  if (method === 'POST' && url === '/api/comercial/vendas/por-documento') {
    const body = await readJson<{ documento?: string; viewer_profile_id?: string; viewer_perfil?: string; limit?: number }>(req)
    const documento = String(body.documento ?? '').replace(/\D/g, '')
    const vendas = documento
      ? await repo.listSalesByDocumento(documento, {
          viewer_profile_id: body.viewer_profile_id ?? null,
          viewer_perfil: body.viewer_perfil ?? null,
          limit: body.limit ?? 500,
        })
      : []
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

  // ── NFS-e ─────────────────────────────────────────────────────────────
  if (method === 'GET' && url === '/api/nfse/configuracoes') {
    const configuracoes = await repo.listNfseConfiguracoes()
    writeJson(res, 200, {
      ok: true,
      configuracoes: (configuracoes as Array<Record<string, unknown>>).map(sanitizeNfseConfig),
    }, corsOrigin)
    return true
  }

  if (method === 'GET' && url === '/api/nfse/configuracao') {
    const configuracao = await repo.getActiveNfseConfiguracao()
    writeJson(res, 200, { ok: true, configuracao: sanitizeNfseConfig(configuracao as Record<string, unknown> | null) }, corsOrigin)
    return true
  }

  if (method === 'POST' && url === '/api/nfse/configuracao/testar') {
    const body = await readJson<{ configuracao_id?: string }>(req)
    const configuracoes = await repo.listNfseConfiguracoes()
    const configuracao = (configuracoes as Array<Record<string, unknown>>).find(item => {
      if (body.configuracao_id) return item.id === body.configuracao_id
      return item.ativo === true
    }) ?? null

    if (!configuracao) {
      writeJson(res, 404, {
        ok: false,
        error: 'Nenhuma configuração fiscal foi encontrada para testar.',
        next_step: 'Salve a configuração fiscal da Certifast antes de testar a NFS-e.',
      }, corsOrigin)
      return true
    }

    const checks = buildNfseRequiredChecks(configuracao)
    const certExists = await certificateFileExists(configuracao.certificado_pfx_path)
    checks.certificado_a1 = checks.certificado_a1 && certExists

    const payload = extractStringRecord(configuracao.payload_reforma_tributaria)
    const wsdl = String(payload.ginfes_wsdl_homologacao ?? payload.gissonline_wsdl_url ?? '').trim()
    let tlsWarning: string | null = null
    if (wsdl) {
      try {
        const response = await fetch(wsdl, { signal: AbortSignal.timeout(15000) })
        checks.wsdl_configurado = response.ok || response.status === 400 || response.status === 403
        if (!response.ok) {
          tlsWarning = `WSDL respondeu HTTP ${response.status}. Em homologação GINFES, é comum exigir certificado digital cliente para liberar o WSDL.`
        }
      } catch (error) {
        checks.wsdl_configurado = false
        tlsWarning = error instanceof Error ? error.message : 'Não foi possível acessar o WSDL informado.'
      }
    }

    const pendencias = Object.entries(checks)
      .filter(([, ok]) => !ok)
      .map(([key]) => key)

    writeJson(res, 200, {
      ok: pendencias.length === 0,
      message: pendencias.length === 0
        ? 'Configuração fiscal pronta para o próximo teste de emissão.'
        : 'A configuração fiscal ainda possui pendências antes da emissão.',
      error: pendencias.length === 0 ? undefined : 'Revise os campos obrigatórios destacados no checklist.',
      next_step: pendencias.length === 0
        ? 'Próximo passo: emitir uma venda de teste em homologação e acompanhar o retorno do provedor.'
        : 'Complete os itens pendentes e execute o teste novamente.',
      tls_warning: tlsWarning,
      checks,
    }, corsOrigin)
    return true
  }

  if (method === 'GET' && url.startsWith('/api/nfse/emitentes')) {
    const parsedUrl = new URL(req.url ?? url, 'http://localhost')
    const q = parsedUrl.searchParams.get('q') ?? ''
    const emitentes = await repo.searchNfseEmitentes(q)
    writeJson(res, 200, { ok: true, emitentes }, corsOrigin)
    return true
  }

  if (method === 'POST' && url === '/api/nfse/certificado/validar') {
    const body = await readJson<{ file_base64?: string; senha?: string; filename?: string }>(req)
    const fileBase64 = String(body.file_base64 ?? '').trim()
    const senha = String(body.senha ?? '')
    const filename = String(body.filename ?? 'certificado.pfx')
    if (!fileBase64 || !senha) {
      writeJson(res, 400, { ok: false, error: 'Informe o arquivo A1 e a senha do certificado.' }, corsOrigin)
      return true
    }
    const pfx = Buffer.from(fileBase64, 'base64')
    try {
      const validation = await validatePfx(pfx, senha)
      writeJson(res, 200, {
        ok: true,
        certificado: {
          filename,
          tamanho_bytes: pfx.length,
          senha_validada: true,
          ...validation,
        },
      }, corsOrigin)
    } catch {
      writeJson(res, 400, {
        ok: false,
        error: 'Não foi possível abrir o certificado A1 com esta senha neste servidor. Se a senha abre no Windows, o arquivo pode estar em formato legado ou incompatível; reexporte o A1 em .pfx/.p12 marcando a chave privada e tente novamente.',
      }, corsOrigin)
    }
    return true
  }

  if (method === 'POST' && url === '/api/nfse/certificado/vincular') {
    const body = await readJson<{ file_base64?: string; senha?: string; filename?: string; cnpj_emitente?: string }>(req)
    const fileBase64 = String(body.file_base64 ?? '').trim()
    const senha = String(body.senha ?? '')
    const filename = String(body.filename ?? 'certificado.pfx')
    const cnpj = String(body.cnpj_emitente ?? '').replace(/\D/g, '')
    if (!fileBase64 || !senha || !cnpj) {
      writeJson(res, 400, { ok: false, error: 'Informe CNPJ do emitente, arquivo A1 e senha do certificado.' }, corsOrigin)
      return true
    }
    const pfx = Buffer.from(fileBase64, 'base64')
    try {
      const validation = await validatePfx(pfx, senha)
      const ext = normalizeCertExtension(filename)
      const relativePath = `${cnpj}/certificado${ext}`
      const dir = join(NFSE_CERT_STORAGE_DIR, cnpj)
      const absolutePath = join(dir, `certificado${ext}`)
      await mkdir(dir, { recursive: true })
      await writeFile(absolutePath, pfx, { mode: 0o600 })
      writeJson(res, 200, {
        ok: true,
        certificado: {
          filename,
          path: relativePath,
          storage: 'backend',
          tamanho_bytes: pfx.length,
          senha_validada: true,
          ...validation,
        },
      }, corsOrigin)
    } catch {
      writeJson(res, 400, {
        ok: false,
        error: 'Não foi possível validar e vincular o certificado. Confira o arquivo exportado com chave privada e a senha informada.',
      }, corsOrigin)
    }
    return true
  }

  if (method === 'POST' && url === '/api/nfse/certificado/remover') {
    const body = await readJson<{ path?: string }>(req)
    const relativePath = String(body.path ?? '').trim().replace(/\\/g, '/')
    if (!relativePath || relativePath.includes('..') || relativePath.startsWith('/')) {
      writeJson(res, 400, { ok: false, error: 'Caminho do certificado inválido.' }, corsOrigin)
      return true
    }
    const absolutePath = resolve(NFSE_CERT_STORAGE_DIR, relativePath)
    if (!absolutePath.startsWith(NFSE_CERT_STORAGE_DIR)) {
      writeJson(res, 400, { ok: false, error: 'Caminho do certificado inválido.' }, corsOrigin)
      return true
    }
    await rm(absolutePath, { force: true }).catch(() => undefined)
    writeJson(res, 200, { ok: true }, corsOrigin)
    return true
  }

  if (method === 'POST' && url === '/api/nfse/configuracoes') {
    const body = await readJson<Record<string, unknown>>(req)
    const configuracao = await repo.saveNfseConfiguracao(body)
    writeJson(res, 200, { ok: true, configuracao: sanitizeNfseConfig(configuracao as Record<string, unknown>) }, corsOrigin)
    return true
  }

  const nfseVendaMatch = url.match(/^\/api\/nfse\/venda\/([^/]+)$/)
  if (method === 'GET' && nfseVendaMatch) {
    const notas = await repo.listNfseByVenda(nfseVendaMatch[1])
    writeJson(res, 200, { ok: true, notas }, corsOrigin)
    return true
  }

  if (method === 'POST' && url === '/api/nfse') {
    const body = await readJson<Record<string, unknown>>(req)
    const nfse = await repo.createNfse(body)
    writeJson(res, 201, { ok: true, nfse }, corsOrigin)
    return true
  }

  if (method === 'POST' && url === '/api/nfse/emitir') {
    const body = await readJson<{ venda_certificado_id?: string }>(req)
    if (!body.venda_certificado_id) {
      writeJson(res, 400, { ok: false, error: 'venda_certificado_id e obrigatorio.' }, corsOrigin)
      return true
    }
    try {
      const { emitirNFSeGinfes } = await import('../services/nfseGinfesService.js')
      const result = await emitirNFSeGinfes(repo, body.venda_certificado_id)
      writeJson(res, result.ok ? 200 : 422, result, corsOrigin)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao emitir NFS-e.'
      writeJson(res, 500, { ok: false, error: message }, corsOrigin)
    }
    return true
  }

  const nfseCancelMatch = url.match(/^\/api\/nfse\/([^/]+)\/cancelar$/)
  if (method === 'POST' && nfseCancelMatch) {
    const body = await readJson<{
      codigo_cancelamento?: string
      justificativa?: string
      observacao?: string | null
      cancelado_por?: string | null
    }>(req)
    if (!body.codigo_cancelamento || !body.justificativa?.trim()) {
      writeJson(res, 400, { ok: false, error: 'codigo_cancelamento e justificativa são obrigatórios.' }, corsOrigin)
      return true
    }
    try {
      const { cancelarNFSeEmitida } = await import('../services/nfseGinfesService.js')
      const result = await cancelarNFSeEmitida(repo, {
        nfseId: nfseCancelMatch[1],
        codigoCancelamento: body.codigo_cancelamento,
        justificativa: body.justificativa,
        observacao: body.observacao,
        canceladoPor: body.cancelado_por,
      })
      writeJson(res, result.ok ? 200 : 422, result, corsOrigin)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao cancelar NFS-e.'
      writeJson(res, 500, { ok: false, error: message }, corsOrigin)
    }
    return true
  }

  const nfseDeleteMatch = url.match(/^\/api\/nfse\/([^/]+)$/)
  if (method === 'DELETE' && nfseDeleteMatch) {
    const deleted = await repo.deleteNfse(nfseDeleteMatch[1])
    if (!deleted) {
      writeJson(res, 409, { ok: false, error: 'NFS-e não encontrada ou não pode ser excluída.' }, corsOrigin)
      return true
    }
    writeJson(res, 200, { ok: true, deleted }, corsOrigin)
    return true
  }

  return false
}
