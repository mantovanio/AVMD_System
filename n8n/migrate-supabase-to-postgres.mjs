import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const POSTGRES_CRED = { postgres: { id: 'ukllpaFrPyrRfyG9', name: 'Postgres | AVMD' } }

function toSqlValue(v) {
  if (v == null) return 'NULL'
  const s = String(v)
  if (s.startsWith('={{')) {
    return s.slice(1)
  }
  return `'${s.replace(/'/g, "''")}'`
}

function getFiltersWhere(filters) {
  const conds = filters?.conditions || []
  if (conds.length === 0) return ''
  return 'WHERE ' + conds.map(c => `${c.keyName} = ${toSqlValue(c.keyValue)}`).join(' AND ')
}

function getFieldsSets(fieldsUi) {
  const fields = fieldsUi?.fieldValues || []
  return fields.map(f => `${f.fieldId} = ${toSqlValue(f.fieldValue)}`).join(', ')
}

function getFieldsCols(fieldsUi) {
  const fields = fieldsUi?.fieldValues || []
  return fields.map(f => f.fieldId).join(', ')
}

function getFieldsVals(fieldsUi) {
  const fields = fieldsUi?.fieldValues || []
  return fields.map(f => toSqlValue(f.fieldValue)).join(', ')
}

function toPostgres(node) {
  if (node.type !== 'n8n-nodes-base.supabase') return false

  const { operation, tableId, filters, fieldsUi } = node.parameters
  if (!tableId) return false

  node.type = 'n8n-nodes-base.postgres'
  node.typeVersion = 2.5
  node.credentials = POSTGRES_CRED

  if (operation === 'get') {
    const where = getFiltersWhere(filters)
    node.parameters = { operation: 'executeQuery', query: `SELECT * FROM ${tableId} ${where} LIMIT 1`, options: {} }
    return true
  }

  if (operation === 'getAll') {
    node.parameters = { operation: 'executeQuery', query: `SELECT * FROM ${tableId}`, options: {} }
    return true
  }

  if (operation === 'update') {
    const where = getFiltersWhere(filters)
    const sets = getFieldsSets(fieldsUi)
    node.parameters = { operation: 'executeQuery', query: `UPDATE ${tableId} SET ${sets}, updated_at = NOW() WHERE ${where}`, options: {} }
    return true
  }

  if (!operation || operation === 'insert') {
    const cols = getFieldsCols(fieldsUi)
    const vals = getFieldsVals(fieldsUi)
    if (cols) {
      node.parameters = { operation: 'executeQuery', query: `INSERT INTO ${tableId} (${cols}) VALUES (${vals}) RETURNING id`, options: {} }
      return true
    }
  }

  node.parameters = { operation: 'executeQuery', query: `SELECT 1 FROM ${tableId} LIMIT 1`, options: {} }
  return true
}

const workflows = [
  'avmd-consultaCRM-CertiID.json',
  'sobreEmpresa-CertiID.json',
  'renovaCertiID-CertiID.json',
  'suporteCertiID-CertiID.json',
  'CRM-CertiID.json',
]

for (const file of workflows) {
  const filePath = join(__dirname, file)
  console.log(`\n=== ${file} ===`)
  const raw = readFileSync(filePath, 'utf8')
  const wf = JSON.parse(raw)

  let count = 0
  for (const node of wf.nodes) {
    if (toPostgres(node)) {
      console.log(`  ${node.name}: Supabase -> Postgres`)
      if (node.parameters.query) {
        console.log(`    SQL: ${node.parameters.query.slice(0, 200)}`)
      }
      count++
    }
  }

  writeFileSync(filePath, JSON.stringify(wf, null, 2))
  console.log(`  Saved. ${count} nodes migrated.`)
}

// Handle supabaseTool nodes
console.log('\n=== Removing supabaseTool nodes ===')

for (const file of ['sobreEmpresa-CertiID.json', 'renovaCertiID-CertiID.json']) {
  const filePath = join(__dirname, file)
  const raw = readFileSync(filePath, 'utf8')
  const wf = JSON.parse(raw)

  const toolNames = new Set()
  for (const node of wf.nodes) {
    if (node.type === 'n8n-nodes-base.supabaseTool') {
      toolNames.add(node.name)
    }
  }

  if (toolNames.size === 0) {
    console.log(`  No supabaseTool in ${file}`)
    continue
  }

  console.log(`  ${file}: removing ${[...toolNames].join(', ')}`)

  // Remove from nodes array
  wf.nodes = wf.nodes.filter(n => !toolNames.has(n.name))

  // Remove from ai_tool connections
  for (const [nodeName, conns] of Object.entries(wf.connections)) {
    if (conns.ai_tool) {
      conns.ai_tool = conns.ai_tool
        .map(list => list.filter(t => !toolNames.has(t.node)))
        .filter(list => list.length > 0)
      if (conns.ai_tool.length === 0) {
        delete conns.ai_tool
      }
    }
  }

  writeFileSync(filePath, JSON.stringify(wf, null, 2))
  console.log(`  Saved. supabaseTool removed.`)
}

console.log('\nDone!')
