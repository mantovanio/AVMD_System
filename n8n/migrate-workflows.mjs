/**
 * Migrate n8n workflows: Supabase → Postgres (Aiven)
 * 
 * Usage: node n8n/migrate-workflows.mjs
 * 
 * Transforms:
 *   - n8n-nodes-base.supabase → n8n-nodes-base.postgres
 *   - n8n-nodes-base.supabaseTool → n8n-nodes-base.code (pre-fetch)
 *   - Updates credentials, parameters
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const POSTGRES_CRED = { postgres: { id: 'ukllpaFrPyrRfyG9', name: 'Postgres | AVMD' } }

function transformSupabaseToPostgres(node) {
  if (!node.parameters || !node.parameters.operation) return false

  const { operation, tableId, filters, fieldsUi } = node.parameters

  // Map table names
  const tableMap = {
    'crm_customers': 'crm_customers',
    'crm_chat_conversations': 'crm_chat_conversations',
    'crm_chat_messages': 'crm_chat_messages',
    'catalogo_ia': 'catalogo_ia',
  }

  const table = tableMap[tableId]
  if (!table) return false

  node.type = 'n8n-nodes-base.postgres'
  node.typeVersion = 2.5
  node.credentials = POSTGRES_CRED

  if (operation === 'get') {
    // Map Supabase filter conditions to WHERE clause
    const conditions = filters?.conditions || []
    const whereClauses = conditions.map((c, i) => {
      const idx = i + 1
      // Extract the expression from keyValue like "={{ $json.whatsapp_lead }}"
      const valExpr = c.keyValue || '$$$'
      return `${c.keyName} = $${idx} /* ${valExpr.replace(/=/g, '=')} */`
    }).join(' AND ')

    const valueRefs = conditions.map((c, i) => {
      const valExpr = c.keyValue || ''
      return valExpr.startsWith('={{') ? valExpr.slice(3, -2).trim() : `'${valExpr}'`
    })

    if (whereClauses) {
      node.parameters = {
        operation: 'executeQuery',
        query: `SELECT * FROM ${table} WHERE ${whereClauses} LIMIT 1`,
        options: {}
      }
    }
  } else if (operation === 'getAll') {
    node.parameters = {
      operation: 'executeQuery',
      query: `SELECT * FROM ${table} WHERE ativo = true ORDER BY tipo, modelo`,
      options: {}
    }
  } else if (operation === 'update') {
    const conditions = filters?.conditions || []
    const whereClauses = conditions.map((c, i) => `${c.keyName} = $${i + 1}`).join(' AND ')
    const fields = fieldsUi?.fieldValues || []
    const setClauses = fields.map((f, i) => `${f.fieldId} = $${conditions.length + i + 1}`).join(', ')

    if (whereClauses && setClauses) {
      node.parameters = {
        operation: 'executeQuery',
        query: `UPDATE ${table} SET ${setClauses}, updated_at = NOW() WHERE ${whereClauses}`,
        options: {}
      }
    }
  } else if (operation === 'insert' || !operation) {
    // For create/insert operations, derive columns from fieldsUi
    const fields = fieldsUi?.fieldValues || []
    const cols = fields.map(f => f.fieldId).join(', ')
    const placeholders = fields.map((_, i) => `$${i + 1}`).join(', ')

    if (cols) {
      node.parameters = {
        operation: 'executeQuery',
        query: `INSERT INTO ${table} (${cols}) VALUES (${placeholders}) RETURNING id`,
        options: {}
      }
    }
  }

  return true
}

function removeSupabaseTool(node) {
  if (node.type !== 'n8n-nodes-base.supabaseTool') return false
  // Mark for removal (we'll filter these out)
  return true
}

function processWorkflow(filePath) {
  console.log(`\nProcessing: ${filePath}`)
  const raw = readFileSync(filePath, 'utf8')
  const wf = JSON.parse(raw)

  let changes = 0
  const nodesToRemove = new Set()

  for (const node of wf.nodes) {
    if (node.type === 'n8n-nodes-base.supabase') {
      if (transformSupabaseToPostgres(node)) {
        console.log(`  ✅ ${node.name}: Supabase → Postgres`)
        changes++
      }
    }
    if (removeSupabaseTool(node)) {
      nodesToRemove.add(node.name)
      console.log(`  🔄 ${node.name}: supabaseTool marked for replacement`)
      changes++
    }
  }

  // For supabaseTool nodes, we need to replace them with a pre-fetch pattern
  // This is complex - handle workflow-specifically below
  if (nodesToRemove.size > 0) {
    console.log(`  ⚠️  ${nodesToRemove.size} supabaseTool nodes need special handling`)
  }

  if (changes > 0) {
    const outPath = filePath.replace('.json', '.migrated.json')
    writeFileSync(outPath, JSON.stringify(wf, null, 2))
    console.log(`  💾 Saved: ${outPath}`)
    return outPath
  }

  console.log(`  ➡️  No Supabase changes needed`)
  return null
}

// Process all workflow files
const files = [
  'avmd-consultaCRM-CertiID.json',
  'sobreEmpresa-CertiID.json',
  'renovaCertiID-CertiID.json',
  'suporteCertiID-CertiID.json',
  'CRM-CertiID.json',
  'alertaHumano-CertiID.json',
]

for (const f of files) {
  processWorkflow(join(__dirname, f))
}

console.log('\nDone!')
