/**
 * 057_backfill_media_persist.ts
 * 
 * Rodar com: npx tsx sql/057_backfill_media_persist.ts
 * 
 * Migra mensagens que têm media_url como data: URI para path permanente.
 * Salva o arquivo no storage/attachments e atualiza crm_chat_messages.media_url.
 */
import { createAivenSqlClient } from '../db/aivenClient.js'
import { FileRepository } from '../repositories/fileRepository.js'
import { buildStoredPath, saveFile } from '../utils/storage.js'

const db = createAivenSqlClient()
const fileRepository = new FileRepository(db)

interface MessageRow {
  id: string
  conversation_id: string
  external_message_id: string | null
  media_url: string | null
  mime_type: string | null
  file_name: string | null
  mensagem: string | null
}

function inferFileName(mimeType: string): string {
  const mime = mimeType.toLowerCase()
  if (mime.includes('pdf')) return 'documento.pdf'
  if (mime.includes('png')) return 'imagem.png'
  if (mime.includes('webp')) return 'imagem.webp'
  if (mime.includes('jpeg') || mime.includes('jpg') || mime.startsWith('image/')) return 'imagem.jpg'
  if (mime.includes('mpeg') || mime.includes('mp3')) return 'audio.mp3'
  if (mime.includes('ogg') || mime.includes('opus') || mime.startsWith('audio/')) return 'audio.ogg'
  if (mime.includes('mp4') || mime.startsWith('video/')) return 'video.mp4'
  return 'arquivo'
}

async function main() {
  console.log('[backfill] Iniciando backfill de midia...')

  const result = await db.query<MessageRow>(
    `SELECT id, conversation_id, external_message_id, media_url, mime_type, file_name, mensagem
     FROM crm_chat_messages
     WHERE media_url LIKE 'data:%'
     ORDER BY created_at ASC`
  )

  const messages = result.rows
  console.log(`[backfill] Encontradas ${messages.length} mensagens com data: URI`)

  let saved = 0
  let skipped = 0
  let errors = 0

  for (const msg of messages) {
    try {
      if (!msg.media_url || !msg.conversation_id) {
        skipped++
        continue
      }

      const match = msg.media_url.match(/^data:([^;]+);base64,(.+)$/)
      if (!match) {
        skipped++
        continue
      }

      const mimeType = match[1]
      const base64 = match[2]
      const fileName = msg.file_name || inferFileName(mimeType)

      let buffer: Buffer
      try {
        buffer = Buffer.from(base64, 'base64')
      } catch {
        errors++
        continue
      }

      if (buffer.length > 50 * 1024 * 1024) {
        console.log(`[backfill] Pulando ${fileName}: arquivo muito grande (${buffer.length} bytes)`)
        skipped++
        continue
      }

      const storedPath = buildStoredPath(msg.conversation_id, fileName)
      saveFile(storedPath, buffer)

      const fileRecord = await fileRepository.create({
        conversation_id: msg.conversation_id,
        original_name: fileName,
        stored_path: storedPath,
        mime_type: mimeType,
        size_bytes: buffer.length,
        uploaded_by: null,
      })

      const permanentUrl = `/api/chat/files/${fileRecord.id}`

      await db.query(
        `UPDATE crm_chat_messages
         SET media_url = $1, mime_type = COALESCE(mime_type, $2), file_name = COALESCE(file_name, $3)
         WHERE id = $4`,
        [permanentUrl, mimeType, fileName, msg.id],
      )

      saved++
      if (saved % 10 === 0) {
        console.log(`[backfill] Progresso: ${saved}/${messages.length} salvas`)
      }
    } catch (err) {
      console.error(`[backfill] Erro ao processar mensagem ${msg.id}:`, err)
      errors++
    }
  }

  console.log(`[backfill] Concluido: ${saved} salvas, ${skipped} puladas, ${errors} erros`)
}

main().catch(err => {
  console.error('[backfill] Erro fatal:', err)
  process.exit(1)
})
