import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

const rootDir = process.cwd()
const n8nDir = path.join(rootDir, 'n8n')

loadEnvFile(path.join(rootDir, '.env.local'))
loadEnvFile(path.join(rootDir, 'n8n', '.env.local'))

const orderedWorkflowFiles = [
  'avmd-clara-inbound-router.workflow.json',
  'avmd-clara-renovacao-handler.workflow.json',
  'avmd-clara-agendamento-handler.workflow.json',
  'avmd-clara-link-resender.workflow.json',
  'avmd-clara-human-handoff.workflow.json',
  'avmd-clara-inbound-smoketest.workflow.json',
  'avmd-schedule-email-router.workflow.json',
  'avmd-schedule-email-smoketest-certiid.workflow.json',
  'avmd-schedule-email-smoketest-certifast.workflow.json',
  'avmd-event-receiver.workflow.json',
  'avmd-clara-logger.workflow.json',
]

const apiBaseUrl = normalizeApiBaseUrl(
  process.env.N8N_API_URL ||
    process.env.N8N_BASE_URL ||
    'http://localhost:5678/api/v1',
)

const dryRun = process.argv.includes('--dry-run')
const activate = process.argv.includes('--activate')
const onlyArg = process.argv.find((arg) => arg.startsWith('--only='))
const onlyFiles = onlyArg
  ? onlyArg
      .slice('--only='.length)
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
  : []

if (!existsSync(n8nDir)) {
  console.error(`Diretorio nao encontrado: ${n8nDir}`)
  process.exit(1)
}

const authHeaders = buildAuthHeaders()
if (!dryRun && Object.keys(authHeaders).length === 0) {
  console.error(
    'Configure N8N_API_KEY ou N8N_API_BEARER_TOKEN antes de importar os workflows.',
  )
  process.exit(1)
}

const workflowFiles = resolveWorkflowFiles(onlyFiles)
if (workflowFiles.length === 0) {
  console.error('Nenhum workflow encontrado para importacao.')
  process.exit(1)
}

const existingWorkflows = dryRun ? new Map() : await loadExistingWorkflows()
const summary = []

for (const fileName of workflowFiles) {
  const workflowPath = path.join(n8nDir, fileName)
  const workflow = JSON.parse(readFileSync(workflowPath, 'utf8'))
  validateWorkflow(workflow, fileName)

  const payload = buildWorkflowPayload(workflow, { activate })
  const existing = existingWorkflows.get(workflow.name)

  if (dryRun) {
    summary.push({
      file: fileName,
      action: existing ? 'update' : 'create',
      name: workflow.name,
    })
    continue
  }

  const result = existing
    ? await updateWorkflow(existing.id, payload)
    : await createWorkflow(payload)

  summary.push({
    file: fileName,
    action: existing ? 'updated' : 'created',
    name: workflow.name,
    id: result.id ?? existing?.id ?? null,
    active: result.active ?? payload.active ?? false,
  })
}

console.log(JSON.stringify({ ok: true, dryRun, apiBaseUrl, workflows: summary }, null, 2))

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return

  const content = readFileSync(filePath, 'utf8')
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue

    const separatorIndex = line.indexOf('=')
    if (separatorIndex <= 0) continue

    const key = line.slice(0, separatorIndex).trim()
    let value = line.slice(separatorIndex + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }

    if (!process.env[key]) {
      process.env[key] = value
    }
  }
}

function normalizeApiBaseUrl(value) {
  const trimmed = String(value || '').trim().replace(/\/+$/, '')
  if (!trimmed) return 'http://localhost:5678/api/v1'
  if (/\/api\/v\d+$/i.test(trimmed)) return trimmed
  if (/\/api$/i.test(trimmed)) return `${trimmed}/v1`
  return `${trimmed}/api/v1`
}

function buildAuthHeaders() {
  const apiKey = String(process.env.N8N_API_KEY || '').trim()
  const bearerToken = String(process.env.N8N_API_BEARER_TOKEN || '').trim()

  if (apiKey) {
    return { 'X-N8N-API-KEY': apiKey }
  }

  if (bearerToken) {
    return { Authorization: `Bearer ${bearerToken}` }
  }

  return {}
}

function resolveWorkflowFiles(only) {
  const available = new Set(
    readdirSync(n8nDir).filter((file) => file.endsWith('.workflow.json')),
  )

  const selected = only.length > 0 ? only : orderedWorkflowFiles
  const result = []

  for (const file of selected) {
    if (!available.has(file)) {
      throw new Error(`Workflow nao encontrado: ${file}`)
    }
    result.push(file)
  }

  for (const file of [...available].sort()) {
    if (!result.includes(file) && !orderedWorkflowFiles.includes(file) && only.length === 0) {
      result.push(file)
    }
  }

  return result
}

function validateWorkflow(workflow, fileName) {
  if (!workflow || typeof workflow !== 'object') {
    throw new Error(`Workflow invalido em ${fileName}`)
  }

  if (!workflow.name || !Array.isArray(workflow.nodes) || !workflow.connections) {
    throw new Error(`Estrutura obrigatoria ausente em ${fileName}`)
  }
}

function buildWorkflowPayload(workflow, options) {
  return {
    name: workflow.name,
    nodes: workflow.nodes,
    connections: workflow.connections,
    settings: workflow.settings || {},
    active: options.activate ? true : Boolean(workflow.active),
  }
}

async function loadExistingWorkflows() {
  const records = await apiRequest('GET', '/workflows')
  const items = Array.isArray(records?.data)
    ? records.data
    : Array.isArray(records)
      ? records
      : []

  return new Map(
    items
      .filter((item) => item && typeof item === 'object' && item.name)
      .map((item) => [item.name, item]),
  )
}

async function createWorkflow(payload) {
  return apiRequest('POST', '/workflows', payload)
}

async function updateWorkflow(id, payload) {
  try {
    return await apiRequest('PATCH', `/workflows/${id}`, payload)
  } catch (error) {
    const message = String(error?.message || '')
    if (!message.includes('HTTP 404') && !message.includes('HTTP 405')) {
      throw error
    }
    return apiRequest('PUT', `/workflows/${id}`, payload)
  }
}

async function apiRequest(method, pathname, body) {
  const response = await fetch(`${apiBaseUrl}${pathname}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders,
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  const text = await response.text()
  const payload = text ? safeJsonParse(text) : null

  if (!response.ok) {
    throw new Error(
      `HTTP ${response.status} em ${method} ${pathname}: ${
        typeof payload === 'string' ? payload : JSON.stringify(payload)
      }`,
    )
  }

  return payload
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}
