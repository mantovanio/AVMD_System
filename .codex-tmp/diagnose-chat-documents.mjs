import pg from 'pg'

process.loadEnvFile?.('backend/.env.local')
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
})

const messages = await pool.query(`
  SELECT
    m.id,
    m.conversation_id,
    m.external_message_id,
    m.mensagem,
    m.mime_type,
    m.file_name,
    m.media_url,
    m.created_at,
    c.document_key,
    c.whatsapp_instance
  FROM crm_chat_messages m
  JOIN crm_chat_conversations c ON c.id = m.conversation_id
  WHERE lower(trim(coalesce(m.mensagem, ''))) IN ('documento', 'arquivo')
     OR coalesce(m.mime_type, '') LIKE 'application/%'
  ORDER BY m.created_at DESC
  LIMIT 3
`)

const events = await pool.query(`
  SELECT
    e.id,
    e.external_id,
    e.created_at,
    e.payload->>'messageType' AS message_type,
    e.payload->>'mimeType' AS mime_type,
    e.payload->>'fileName' AS file_name,
    e.payload->>'mediaUrl' AS media_url,
    (e.payload::text LIKE '%base64%') AS possui_base64
  FROM communication_events e
  WHERE e.source = 'evolution'
    AND (
      lower(trim(coalesce(e.payload->>'content', ''))) IN ('documento', 'arquivo')
      OR coalesce(e.payload->>'mimeType', '') LIKE 'application/%'
    )
  ORDER BY e.created_at DESC
  LIMIT 3
`)

const admins = await pool.query(`
  SELECT id, nome
  FROM profiles
  WHERE status = 'ativo' AND perfil IN ('admin', 'superadmin')
  ORDER BY updated_at DESC
`)

console.log(JSON.stringify({ messages: messages.rows, events: events.rows, admins: admins.rows }, null, 2))
await pool.end()
