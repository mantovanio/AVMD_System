import fs from 'node:fs/promises'
import dgram from 'node:dgram'
import path from 'node:path'
import process from 'node:process'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import ffmpegModule from 'ffmpeg-static'

const TEXT_EXTENSIONS = new Set(['.md', '.txt', '.json', '.ts', '.tsx', '.js', '.mjs', '.ps1', '.sql', '.yml', '.yaml', '.log'])
const IGNORE_DIRS = new Set(['.git', 'node_modules', 'dist', 'build', '.next', '.cache', 'storage', 'tmp', 'temp', '.venv'])
const MAX_FILES = 240
const MAX_FILE_SIZE = 200_000
const MAX_SNIPPET_CHARS = 1_200
const MAX_REPLY_CHARS = 3_500
const ALLOWED_HTTP_HOSTS = new Set(['localhost', '127.0.0.1', 'api.certiid.mantovan.com.br', 'auto.mantovan.com.br'])
const FFMPEG_PATH = typeof ffmpegModule === 'string' ? ffmpegModule : ffmpegModule?.default

const env = (name, fallback = '') => String(process.env[name] || fallback).trim()

const config = {
  botToken: env('TELEGRAM_BOT_TOKEN'),
  adminChatIds: env('TELEGRAM_ADMIN_CHAT_IDS').split(',').map(s => s.trim()).filter(Boolean),
  workspacePath: path.resolve(env('TELEGRAM_AGENT_WORKSPACE', process.cwd())),
  statePath: env('TELEGRAM_AGENT_STATE_PATH', path.join(process.env.LOCALAPPDATA || process.env.APPDATA || process.cwd(), 'AVMD', 'telegram-rag-agent', 'state.json')),
  openaiApiKey: env('OPENAI_API_KEY'),
  openaiModel: env('OPENAI_MODEL', 'gpt-4.1-mini'),
  n8nWebhookUrl: env('N8N_AGENT_WEBHOOK_URL'),
  remoteApiBaseUrl: env('AVMD_REMOTE_API_BASE_URL', 'https://api.certiid.mantovan.com.br'),
  agentRoutes: (() => {
    const raw = env('TELEGRAM_AGENT_ROUTES', '')
    if (!raw) return {}
    try {
      const parsed = JSON.parse(raw)
      return parsed && typeof parsed === 'object' ? parsed : {}
    } catch {
      return {}
    }
  })(),
  ragRoots: env('RAG_SEARCH_ROOTS')
    ? env('RAG_SEARCH_ROOTS').split(',').map(s => s.trim()).filter(Boolean)
    : [],
  projectAliases: (() => {
    const raw = env('TELEGRAM_PROJECT_ALIASES', '')
    if (!raw) return {}
    try {
      const parsed = JSON.parse(raw)
      return parsed && typeof parsed === 'object' ? parsed : {}
    } catch {
      return {}
    }
  })(),
  wolTargets: (() => {
    const raw = env('TELEGRAM_WOL_TARGETS', '')
    if (!raw) return {}
    try {
      const parsed = JSON.parse(raw)
      return parsed && typeof parsed === 'object' ? parsed : {}
    } catch {
      return {}
    }
  })(),
}

let knowledgeFiles = []

function normalizeText(value) {
  return String(value ?? '').replace(/\r/g, '').trim()
}

function normalizePath(p) {
  return path.normalize(p)
}

function isAdminChat(chatId) {
  const normalized = String(chatId ?? '').trim()
  return config.adminChatIds.includes(normalized)
}

function resolveProjectTarget(value) {
  const requested = String(value || '').trim()
  if (!requested) throw new Error('Projeto não informado.')
  const aliasTarget = config.projectAliases[requested]
  if (typeof aliasTarget === 'string' && aliasTarget.trim()) {
    return path.resolve(aliasTarget.trim())
  }
  if (path.isAbsolute(requested)) return path.resolve(requested)
  return safeJoinWithin(process.cwd(), requested)
}

function normalizeMacAddress(value) {
  const cleaned = String(value || '').trim().replace(/[^a-fA-F0-9]/g, '')
  if (!/^[a-fA-F0-9]{12}$/.test(cleaned)) {
    throw new Error('MAC inválido para Wake-on-LAN.')
  }
  return cleaned.toUpperCase()
}

function resolveWolTarget(value) {
  const requested = String(value || '').trim()
  if (!requested) throw new Error('Destino Wake-on-LAN não informado.')
  const aliasTarget = config.wolTargets[requested]
  if (aliasTarget && typeof aliasTarget === 'object') {
    return {
      alias: requested,
      mac: normalizeMacAddress(aliasTarget.mac),
      broadcast: String(aliasTarget.broadcast || aliasTarget.ip || '255.255.255.255').trim(),
      port: Number(aliasTarget.port || 9),
    }
  }
  return {
    alias: requested,
    mac: normalizeMacAddress(requested),
    broadcast: '255.255.255.255',
    port: 9,
  }
}

async function sendWakeOnLan(target) {
  const buffer = Buffer.alloc(102, 0xff)
  const macBytes = Buffer.from(target.mac.repeat(16), 'hex')
  macBytes.copy(buffer, 6)

  return await new Promise((resolve, reject) => {
    const socket = dgram.createSocket('udp4')
    socket.once('error', error => {
      socket.close()
      reject(error)
    })
    socket.once('listening', () => {
      socket.setBroadcast(true)
      socket.send(buffer, target.port, target.broadcast, error => {
        socket.close()
        if (error) reject(error)
        else resolve({ ...target })
      })
    })
    socket.bind()
  })
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath)
    return true
  } catch {
    return false
  }
}

async function findCodeCommand() {
  const candidates = [
    env('CODE_CMD_PATH'),
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Microsoft VS Code', 'bin', 'code.cmd'),
    path.join(process.env.PROGRAMFILES || '', 'Microsoft VS Code', 'bin', 'code.cmd'),
    path.join(process.env['ProgramFiles(x86)'] || '', 'Microsoft VS Code', 'bin', 'code.cmd'),
    'code.cmd',
  ].filter(Boolean)

  for (const candidate of candidates) {
    if (candidate.includes(path.sep)) {
      if (await pathExists(candidate)) return candidate
      continue
    }
    return candidate
  }

  return 'code.cmd'
}

async function openWorkspaceInVSCode(targetPath) {
  const vscodeCommand = await findCodeCommand()
  return await new Promise((resolve, reject) => {
    const child = spawn('cmd.exe', ['/c', 'start', '""', vscodeCommand, targetPath], {
      windowsHide: true,
      detached: true,
      stdio: 'ignore',
    })
    child.on('error', reject)
    child.unref()
    resolve({ command: vscodeCommand, targetPath })
  })
}

async function refreshKnowledgeFiles() {
  knowledgeFiles = await gatherKnowledgeFiles()
  return knowledgeFiles
}

async function setCurrentWorkspace(target) {
  const resolved = resolveProjectTarget(target)
  if (!(await pathExists(resolved))) {
    throw new Error(`Projeto não encontrado: ${resolved}`)
  }
  const stat = await fs.stat(resolved)
  if (!stat.isDirectory()) {
    throw new Error(`O caminho não é uma pasta de projeto: ${resolved}`)
  }
  config.workspacePath = resolved
  await refreshKnowledgeFiles()
  return resolved
}

async function ensureStateDir() {
  await fs.mkdir(path.dirname(config.statePath), { recursive: true })
}

async function loadState() {
  try {
    const raw = await fs.readFile(config.statePath, 'utf8')
    const data = JSON.parse(raw)
    return {
      offset: Number(data.offset || 0),
      pending: data.pending && typeof data.pending === 'object' ? data.pending : {},
      notes: Array.isArray(data.notes) ? data.notes : [],
    }
  } catch {
    return { offset: 0, pending: {}, notes: [] }
  }
}

async function saveState(state) {
  await ensureStateDir()
  await fs.writeFile(config.statePath, JSON.stringify(state, null, 2), 'utf8')
}

async function telegramRequest(method, body) {
  const url = `https://api.telegram.org/bot${config.botToken}/${method}`
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok || payload.ok === false) {
    throw new Error(String(payload.description || `Telegram respondeu ${response.status}`))
  }
  return payload
}

async function telegramGetFile(fileId) {
  const payload = await telegramRequest('getFile', { file_id: fileId })
  const filePath = payload?.result?.file_path
  if (!filePath) throw new Error('Telegram não retornou file_path.')
  return String(filePath)
}

async function downloadTelegramFile(fileId) {
  const filePath = await telegramGetFile(fileId)
  const url = `https://api.telegram.org/file/bot${config.botToken}/${filePath}`
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Falha ao baixar arquivo do Telegram (${response.status}).`)
  const buffer = Buffer.from(await response.arrayBuffer())
  const mimeType = String(response.headers.get('content-type') || '').split(';')[0] || 'application/octet-stream'
  const filename = path.basename(filePath)
  return { buffer, mimeType, filename, filePath }
}

async function sendMessage(chatId, text) {
  const message = String(text ?? '').trim()
  for (let index = 0; index < message.length; index += MAX_REPLY_CHARS) {
    await telegramRequest('sendMessage', {
      chat_id: chatId,
      text: message.slice(index, index + MAX_REPLY_CHARS),
      disable_web_page_preview: true,
    })
  }
}

async function sendPhoto(chatId, imageBuffer, caption = '') {
  const form = new FormData()
  form.append('chat_id', String(chatId))
  if (caption) form.append('caption', String(caption).slice(0, 1000))
  form.append('photo', new Blob([imageBuffer], { type: 'image/jpeg' }), 'image.jpg')
  const response = await fetch(`https://api.telegram.org/bot${config.botToken}/sendPhoto`, {
    method: 'POST',
    body: form,
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok || payload.ok === false) {
    throw new Error(String(payload.description || `Telegram respondeu ${response.status}`))
  }
  return payload
}

async function getUpdates(offset) {
  const url = `https://api.telegram.org/bot${config.botToken}/getUpdates?timeout=25&offset=${offset}&allowed_updates=%5B%22message%22%5D`
  const response = await fetch(url)
  const payload = await response.json().catch(() => ({}))
  if (!response.ok || payload.ok === false) return null
  return payload.result || []
}

async function listFilesRecursive(root, limit = MAX_FILES) {
  const out = []
  const stack = [normalizePath(root)]

  while (stack.length && out.length < limit) {
    const current = stack.pop()
    let entries = []
    try {
      entries = await fs.readdir(current, { withFileTypes: true })
    } catch {
      continue
    }

    for (const entry of entries) {
      if (out.length >= limit) break
      const full = path.join(current, entry.name)
      if (entry.isDirectory()) {
        if (!IGNORE_DIRS.has(entry.name)) stack.push(full)
        continue
      }
      const ext = path.extname(entry.name).toLowerCase()
      if (!TEXT_EXTENSIONS.has(ext)) continue
      out.push(full)
    }
  }

  return out
}

async function gatherKnowledgeFiles() {
  const roots = [
    config.workspacePath,
    path.resolve(process.cwd()),
    ...config.ragRoots,
    path.resolve(process.cwd(), 'ops'),
    path.resolve(process.cwd(), 'n8n'),
  ].filter((value, index, arr) => value && arr.indexOf(value) === index)

  const files = []
  for (const root of roots) {
    const rootFiles = await listFilesRecursive(root, MAX_FILES)
    for (const file of rootFiles) {
      if (!files.includes(file)) files.push(file)
      if (files.length >= MAX_FILES) break
    }
    if (files.length >= MAX_FILES) break
  }
  return files
}

function tokenize(text) {
  return normalizeText(text)
    .toLowerCase()
    .split(/[^a-z0-9áàâãéèêíìîóòôõúùûç]+/i)
    .map(term => term.trim())
    .filter(term => term.length > 2)
}

function scoreContent(content, queryTerms) {
  const lower = content.toLowerCase()
  let score = 0
  for (const term of queryTerms) {
    if (!term) continue
    const count = lower.split(term).length - 1
    if (count > 0) score += 1 + Math.min(count, 6) * 0.2
  }
  return score
}

async function retrieveKnowledge(query, files) {
  const queryTerms = tokenize(query)
  const scored = []

  for (const file of files) {
    let stat
    try {
      stat = await fs.stat(file)
    } catch {
      continue
    }
    if (stat.size > MAX_FILE_SIZE) continue

    let content = ''
    try {
      content = await fs.readFile(file, 'utf8')
    } catch {
      continue
    }

    const score = scoreContent(content, queryTerms)
    if (score <= 0) continue
    const fileName = path.relative(process.cwd(), file)
    const firstMatch = queryTerms.find(term => content.toLowerCase().includes(term)) || queryTerms[0] || ''
    const matchIndex = firstMatch ? content.toLowerCase().indexOf(firstMatch) : 0
    const start = Math.max(0, matchIndex - 300)
    const end = Math.min(content.length, start + 900)
    const snippet = content.slice(start, end).trim()
    scored.push({
      file: fileName,
      score,
      snippet,
    })
  }

  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, 6)
}

function safeJoinWithin(base, target) {
  const resolvedBase = path.resolve(base)
  const resolvedTarget = path.resolve(base, target)
  const baseWithSep = resolvedBase.endsWith(path.sep) ? resolvedBase : `${resolvedBase}${path.sep}`
  if (resolvedTarget !== resolvedBase && !resolvedTarget.startsWith(baseWithSep)) {
    throw new Error('Caminho fora do workspace permitido.')
  }
  return resolvedTarget
}

function commandLooksDangerous(command) {
  return /(^|[\s;])(Remove-Item|del|erase|rd|rmdir|format|Stop-Process|Restart-Computer|Shutdown|Set-ExecutionPolicy|git\s+reset|git\s+clean|git\s+push\s+--force)\b/i.test(command)
}

async function runPowerShell(command) {
  return await new Promise(resolve => {
    const child = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command], {
      cwd: config.workspacePath,
      windowsHide: true,
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', chunk => { stdout += chunk.toString('utf8') })
    child.stderr.on('data', chunk => { stderr += chunk.toString('utf8') })
    child.on('close', code => {
      resolve({
        exitCode: code ?? 0,
        output: normalizeText([stdout, stderr].filter(Boolean).join('\n')) || '(sem saída)',
      })
    })
  })
}

async function callOpenAI(messages) {
  if (!config.openaiApiKey) {
    throw new Error('OPENAI_API_KEY não configurada.')
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.openaiApiKey}`,
    },
    body: JSON.stringify({
      model: config.openaiModel,
      temperature: 0.2,
      messages,
      response_format: { type: 'json_object' },
    }),
  })

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(String(payload.error?.message || payload.message || `OpenAI respondeu ${response.status}`))
  }

  const content = payload.choices?.[0]?.message?.content
  if (!content) throw new Error('Resposta vazia do modelo.')
  return typeof content === 'string' ? content : JSON.stringify(content)
}

async function transcribeAudio(buffer, filename, mimeType = 'application/octet-stream') {
  if (!config.openaiApiKey) throw new Error('OPENAI_API_KEY não configurada.')

  const form = new FormData()
  form.append('model', 'gpt-4o-mini-transcribe')
  form.append('file', new Blob([buffer], { type: mimeType }), filename || 'audio.dat')

  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.openaiApiKey}`,
    },
    body: form,
  })

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(String(payload.error?.message || payload.message || `OpenAI respondeu ${response.status}`))
  }

  return String(payload.text || '').trim()
}

async function analyzeImageBuffer(buffer, mimeType, promptText) {
  const dataUrl = `data:${mimeType};base64,${buffer.toString('base64')}`
  const messages = [
    { role: 'system', content: 'Você analisa imagens de tela, prints, fotos de erro e documentos visuais para orientar ajustes de software. Responda em português e de forma objetiva.' },
    {
      role: 'user',
      content: [
        { type: 'text', text: promptText },
        { type: 'image_url', image_url: { url: dataUrl } },
      ],
    },
  ]
  const raw = await callOpenAI(messages)
  return normalizeText(raw)
}

async function runFfmpeg(args) {
  if (!FFMPEG_PATH) {
    throw new Error('FFmpeg não disponível. Instale a dependência ou configure FFMPEG_PATH.')
  }
  return await new Promise((resolve, reject) => {
    const child = spawn(FFMPEG_PATH, args, { windowsHide: true })
    let stderr = ''
    child.stderr.on('data', chunk => { stderr += chunk.toString('utf8') })
    child.on('error', reject)
    child.on('close', code => {
      if (code === 0) {
        resolve({ exitCode: code, stderr: normalizeText(stderr) })
      } else {
        reject(new Error(`FFmpeg falhou (${code}): ${normalizeText(stderr).slice(0, 1200)}`))
      }
    })
  })
}

async function extractVideoFrames(videoPath, outputDir, durationSeconds = 0) {
  await fs.mkdir(outputDir, { recursive: true })
  const safeDuration = Number(durationSeconds || 0)
  const frameTimes = safeDuration > 4
    ? [1, Math.max(2, Math.floor(safeDuration / 2)), Math.max(1, safeDuration - 1)]
    : [1]
  const frames = []

  for (let index = 0; index < frameTimes.length; index += 1) {
    const t = frameTimes[index]
    const outputFile = path.join(outputDir, `frame-${index + 1}.jpg`)
    await runFfmpeg(['-y', '-ss', String(t), '-i', videoPath, '-frames:v', '1', '-q:v', '2', outputFile])
    const buffer = await fs.readFile(outputFile)
    frames.push({ file: outputFile, buffer, mimeType: 'image/jpeg' })
  }

  return frames
}

async function extractVideoAudio(videoPath, outputDir) {
  await fs.mkdir(outputDir, { recursive: true })
  const outputFile = path.join(outputDir, 'audio.mp3')
  await runFfmpeg(['-y', '-i', videoPath, '-vn', '-ac', '1', '-ar', '16000', '-b:a', '64k', outputFile])
  const buffer = await fs.readFile(outputFile)
  return { file: outputFile, buffer, mimeType: 'audio/mpeg', filename: 'video-audio.mp3' }
}

function safeMediaName(filename, fallback = 'media.bin') {
  return normalizeText(filename || fallback).replace(/[^\w.\-()+\s]/g, '_').slice(0, 120) || fallback
}

function pickLargestPhoto(message) {
  const photos = Array.isArray(message?.photo) ? message.photo : []
  if (photos.length === 0) return null
  return [...photos].sort((a, b) => Number(b.file_size || 0) - Number(a.file_size || 0))[0] || null
}

function getMediaDescriptor(message) {
  if (pickLargestPhoto(message)) return { kind: 'image', source: 'photo', fileId: pickLargestPhoto(message).file_id, mimeType: 'image/jpeg' }
  if (message?.voice?.file_id) return { kind: 'audio', source: 'voice', fileId: message.voice.file_id, mimeType: 'audio/ogg', duration: Number(message.voice.duration || 0) }
  if (message?.audio?.file_id) return { kind: 'audio', source: 'audio', fileId: message.audio.file_id, mimeType: String(message.audio.mime_type || 'audio/mpeg'), duration: Number(message.audio.duration || 0) }
  if (message?.video?.file_id) return { kind: 'video', source: 'video', fileId: message.video.file_id, mimeType: String(message.video.mime_type || 'video/mp4'), duration: Number(message.video.duration || 0) }
  if (message?.document?.file_id) {
    const mimeType = String(message.document.mime_type || '').trim().toLowerCase()
    const fileName = String(message.document.file_name || '').toLowerCase()
    if (mimeType.startsWith('image/')) return { kind: 'image', source: 'document', fileId: message.document.file_id, mimeType }
    if (mimeType.startsWith('audio/') || /\.(mp3|wav|ogg|m4a|aac|flac)$/i.test(fileName)) return { kind: 'audio', source: 'document', fileId: message.document.file_id, mimeType: mimeType || 'audio/mpeg' }
    if (mimeType.startsWith('video/') || /\.(mp4|mov|mkv|webm|avi)$/i.test(fileName)) return { kind: 'video', source: 'document', fileId: message.document.file_id, mimeType: mimeType || 'video/mp4', duration: Number(message.document.duration || 0) }
  }
  return null
}

async function prepareMediaContext(message) {
  const descriptor = getMediaDescriptor(message)
  if (!descriptor) return null

  const caption = normalizeText(message?.caption || '')
  const download = await downloadTelegramFile(descriptor.fileId)
  const mediaBase = path.join(path.dirname(config.statePath), 'media-cache', `${Date.now()}-${Math.random().toString(16).slice(2)}`)
  await fs.mkdir(mediaBase, { recursive: true })

  if (descriptor.kind === 'image') {
    const imageText = await analyzeImageBuffer(
      download.buffer,
      download.mimeType || descriptor.mimeType,
      [
        'Analise esta imagem recebida no Telegram para ajustes em sistemas e interfaces.',
        'Se for screenshot, diga exatamente o que parece estar errado, o que o usuário provavelmente quer ajustar e que componente do sistema isso sugere.',
        caption ? `Legenda informada pelo usuário: ${caption}` : null,
      ].filter(Boolean).join('\n'),
    )
    return {
      kind: 'image',
      summary: imageText,
      caption,
      filename: safeMediaName(download.filename, 'imagem.bin'),
    }
  }

  if (descriptor.kind === 'audio') {
    const transcript = await transcribeAudio(download.buffer, safeMediaName(download.filename, 'audio.ogg'), download.mimeType || descriptor.mimeType)
    return {
      kind: 'audio',
      summary: transcript ? `Transcrição do áudio: ${transcript}` : 'Áudio sem transcrição útil.',
      caption,
      filename: safeMediaName(download.filename, 'audio.ogg'),
    }
  }

  if (descriptor.kind === 'video') {
    const videoFile = path.join(mediaBase, safeMediaName(download.filename, 'video.mp4'))
    await fs.writeFile(videoFile, download.buffer)
    let transcript = ''
    let frameSummaries = []
    try {
      const audio = await extractVideoAudio(videoFile, path.join(mediaBase, 'audio'))
      transcript = await transcribeAudio(audio.buffer, audio.filename, audio.mimeType)
    } catch (error) {
      transcript = `Falha ao transcrever o áudio do vídeo: ${error instanceof Error ? error.message : String(error)}`
    }

    try {
      const frames = await extractVideoFrames(videoFile, path.join(mediaBase, 'frames'), Number(descriptor.duration || 0))
      for (let index = 0; index < frames.length; index += 1) {
        const frame = frames[index]
        const frameText = await analyzeImageBuffer(
          frame.buffer,
          frame.mimeType,
          [
            `Esta é a imagem quadro ${index + 1} de um vídeo enviado pelo usuário.`,
            'Descreva o que aparece e o que pode indicar sobre o problema ou ajuste solicitado.',
            caption ? `Legenda do vídeo: ${caption}` : null,
          ].filter(Boolean).join('\n'),
        )
        frameSummaries.push(`Quadro ${index + 1}: ${frameText}`)
      }
    } catch (error) {
      frameSummaries.push(`Falha ao extrair quadros: ${error instanceof Error ? error.message : String(error)}`)
    }

    return {
      kind: 'video',
      summary: [
        transcript ? `Transcrição/áudio: ${transcript}` : null,
        ...frameSummaries,
      ].filter(Boolean).join('\n'),
      caption,
      filename: safeMediaName(download.filename, 'video.mp4'),
    }
  }

  return null
}

function buildSystemPrompt() {
  return [
    'Você é o agente operacional da AVMD.',
    'Responda em português, com objetividade.',
    'Você recebe conversas naturais no Telegram e pode executar tarefas no computador do usuário.',
    'Você deve usar o material de contexto recebido como RAG antes de decidir.',
    'Você pode consultar o sistema AVMD para verificar agendamentos, compras, pagamentos, vendas e filas.',
    'Se a solicitação envolver risco, pare e peça confirmação.',
    'Se faltar informação, faça a pergunta mais curta possível.',
    'Retorne SEMPRE JSON válido com esta estrutura:',
    '{',
    '  "action": "answer|list_files|read_file|run_command|n8n_webhook|remember|clarify|switch_project|wake_computer|remote_avmd_query|delegate_agent",',
    '  "reply": "texto para o usuário",',
    '  "args": {},',
    '  "needs_confirmation": false,',
    '  "confidence": 0.0',
    '}',
    'Ação "search_repo" usa args.query e opcionalmente args.path.',
    'Ação "read_file" usa args.path.',
    'Ação "write_file" usa args.path e args.content.',
    'Ação "apply_patch" usa args.patch.',
    'Ação "git_status" não recebe args.',
    'Ação "git_diff" usa args.path opcional.',
    'Ação "http_request" usa args.url, args.method, args.body e args.headers opcionalmente.',
    'Ação "run_command" só deve ser usada quando realmente necessário.',
    'Ação "list_files" usa args.path.',
    'Ação "run_command" usa args.command.',
    'Ação "n8n_webhook" usa args.payload e opcionalmente args.url.',
    'Ação "remember" usa args.note.',
    'Ação "switch_project" usa args.target para trocar o workspace atual e abrir o projeto no VS Code.',
    'Ação "wake_computer" usa args.target para enviar Wake-on-LAN ao computador configurado.',
    'Ação "process_integration_events" usa args.limit para acionar o processamento de eventos pendentes via API local.',
    'Ação "remote_avmd_query" usa args.mode para consultar a VPS pública da AVMD quando a máquina local não estiver disponível.',
    'Ação "delegate_agent" usa args.agent e args.task para delegar a outro agente especializado.',
    'Agentes sugeridos: vps, local_avmd, files, vscode, email, whatsapp, instagram, n8n.',
    'Quando o pedido envolver e-mail, WhatsApp, Instagram, arquivos, editor ou sistema remoto, prefira "delegate_agent" em vez de "run_command".',
    'Se o usuário pedir "verifique", "confira", "me diga se entrou" ou algo parecido sobre agendamento/compra/pagamento, faça consulta HTTP antes de responder.',
    'Se o usuário pedir para verificar agendamento, compra ou pagamento, consulte a API local da AVMD antes de responder.',
    'Nunca execute arquivo TypeScript diretamente com Node. Para scripts do backend, prefira endpoints locais ou build do projeto.',
  ].join('\n')
}

function parseModelJson(raw) {
  const text = String(raw || '').trim()
  const jsonText = text.startsWith('{') ? text : (text.match(/\{[\s\S]*\}/)?.[0] || '')
  if (!jsonText) throw new Error('Modelo não retornou JSON válido.')
  return JSON.parse(jsonText)
}

async function respondNaturalLanguage(message, state, chatId) {
  const retrieval = await retrieveKnowledge(message, knowledgeFiles)
  const contextText = retrieval.length
    ? retrieval.map(item => `ARQUIVO: ${item.file}\nTRECHO:\n${item.snippet}`).join('\n\n---\n\n')
    : 'Sem trechos relevantes encontrados nos documentos indexados.'

  const prompt = [
    { role: 'system', content: buildSystemPrompt() },
    {
      role: 'user',
      content: [
        `Pergunta do usuário: ${message}`,
        '',
        'Contexto recuperado (RAG):',
        contextText,
        '',
        'Memórias úteis:',
        JSON.stringify((state.notes || []).slice(-6), null, 2),
      ].join('\n'),
    },
  ]

  const raw = await callOpenAI(prompt)
  const decision = parseModelJson(raw)
  return { decision, retrieval }
}

function ensureWorkspaceTarget(targetPath) {
  const requested = String(targetPath || '').trim()
  if (!requested) throw new Error('Caminho não informado.')
  return path.isAbsolute(requested) ? path.resolve(requested) : safeJoinWithin(config.workspacePath, requested)
}

async function writeFileWithinWorkspace(targetPath, content) {
  const resolved = ensureWorkspaceTarget(targetPath)
  await fs.mkdir(path.dirname(resolved), { recursive: true })
  await fs.writeFile(resolved, String(content ?? ''), 'utf8')
  return resolved
}

async function runSearch(query, targetPath = config.workspacePath) {
  const searchRoot = ensureWorkspaceTarget(targetPath)
  const searchTerm = String(query || '').trim()
  if (!searchTerm) throw new Error('Consulta de busca vazia.')
  return await new Promise(resolve => {
    const child = spawn('rg', ['-n', searchTerm, searchRoot], {
      cwd: config.workspacePath,
      windowsHide: true,
    })
    let output = ''
    child.stdout.on('data', chunk => { output += chunk.toString('utf8') })
    child.stderr.on('data', chunk => { output += chunk.toString('utf8') })
    child.on('close', code => {
      resolve({
        exitCode: code ?? 0,
        output: normalizeText(output) || '(sem resultados)',
      })
    })
  })
}

async function runGit(args) {
  return await new Promise(resolve => {
    const child = spawn('git', args, {
      cwd: config.workspacePath,
      windowsHide: true,
    })
    let output = ''
    child.stdout.on('data', chunk => { output += chunk.toString('utf8') })
    child.stderr.on('data', chunk => { output += chunk.toString('utf8') })
    child.on('close', code => {
      resolve({
        exitCode: code ?? 0,
        output: normalizeText(output) || '(sem saída)',
      })
    })
  })
}

async function applyPatchText(patchText) {
  const tmpPatch = path.join(path.dirname(config.statePath), `patch-${Math.random().toString(16).slice(2)}.diff`)
  await ensureStateDir()
  await fs.writeFile(tmpPatch, String(patchText ?? ''), 'utf8')
  try {
    const result = await runGit(['apply', '--whitespace=nowarn', tmpPatch])
    return result
  } finally {
    await fs.unlink(tmpPatch).catch(() => {})
  }
}

function isAllowedHttpUrl(rawUrl) {
  try {
    const parsed = new URL(String(rawUrl))
    return ALLOWED_HTTP_HOSTS.has(parsed.hostname.toLowerCase())
  } catch {
    return false
  }
}

async function httpRequest(input) {
  const url = String(input.url || '').trim()
  if (!url) throw new Error('URL não informada.')
  if (!isAllowedHttpUrl(url)) throw new Error('Host HTTP não permitido.')
  const method = String(input.method || 'GET').toUpperCase()
  const headers = input.headers && typeof input.headers === 'object' ? input.headers : {}
  const body = input.body === undefined ? undefined : (typeof input.body === 'string' ? input.body : JSON.stringify(input.body))
  const response = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: method === 'GET' ? undefined : body,
  })
  const text = await response.text()
  return {
    status: response.status,
    ok: response.ok,
    body: text.length > 3500 ? `${text.slice(0, 3500)}\n...[cortado]` : text,
  }
}

async function queryAvmd(input) {
  const mode = String(input.mode || '').trim()
  const baseUrl = 'http://localhost:8787'

  if (mode === 'status') {
    const [sales, schedule] = await Promise.all([
      httpRequest({ url: `${baseUrl}/api/comercial/vendas`, method: 'POST', body: { limit: 12 } }),
      httpRequest({ url: `${baseUrl}/api/comercial/agenda`, method: 'POST', body: { limit: 12 } }),
    ])
    return {
      sales,
      schedule,
    }
  }

  if (mode === 'sales') {
    return await httpRequest({
      url: `${baseUrl}/api/comercial/vendas`,
      method: 'POST',
      body: {
        limit: Number(input.limit || 12),
      },
    })
  }

  if (mode === 'schedule') {
    return await httpRequest({
      url: `${baseUrl}/api/comercial/agenda`,
      method: 'POST',
      body: {
        dataBase: input.dataBase ?? null,
        status: input.status ?? null,
        agenteId: input.agenteId ?? null,
      },
    })
  }

  if (mode === 'sale_by_id') {
    return await httpRequest({
      url: `${baseUrl}/api/comercial/vendas`,
      method: 'POST',
      body: {
        limit: 30,
      },
    })
  }

  throw new Error('Modo AVMD não reconhecido.')
}

function normalizeRemoteBaseUrl(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  return raw.replace(/\/$/, '')
}

function normalizeAgentName(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '_')
}

function resolveAgentRoute(agentName) {
  const normalized = normalizeAgentName(agentName)
  const direct = config.agentRoutes?.[normalized]
  if (typeof direct === 'string' && direct.trim()) return direct.trim()
  const alias = config.agentRoutes?.[agentName]
  if (typeof alias === 'string' && alias.trim()) return alias.trim()
  return ''
}

async function queryRemoteAvmd(input) {
  const baseUrl = normalizeRemoteBaseUrl(config.remoteApiBaseUrl)
  if (!baseUrl) throw new Error('AVMD_REMOTE_API_BASE_URL não configurada.')

  const mode = String(input.mode || '').trim()

  if (mode === 'health') {
    return await httpRequest({ url: `${baseUrl}/healthz`, method: 'GET' })
  }

  if (mode === 'status') {
    const [sales, schedule] = await Promise.all([
      httpRequest({ url: `${baseUrl}/api/comercial/vendas`, method: 'POST', body: { limit: 12 } }),
      httpRequest({ url: `${baseUrl}/api/comercial/agenda`, method: 'POST', body: { limit: 12 } }),
    ])
    return { sales, schedule }
  }

  if (mode === 'sales') {
    return await httpRequest({
      url: `${baseUrl}/api/comercial/vendas`,
      method: 'POST',
      body: {
        limit: Number(input.limit || 12),
      },
    })
  }

  if (mode === 'schedule') {
    return await httpRequest({
      url: `${baseUrl}/api/comercial/agenda`,
      method: 'POST',
      body: {
        dataBase: input.dataBase ?? null,
        status: input.status ?? null,
        agenteId: input.agenteId ?? null,
      },
    })
  }

  if (mode === 'sale_by_id') {
    return await httpRequest({
      url: `${baseUrl}/api/comercial/vendas/get`,
      method: 'POST',
      body: {
        id: input.id ?? input.saleId ?? null,
        pedido: input.pedido ?? input.ref ?? null,
      },
    })
  }

  if (mode === 'catalog') {
    return await httpRequest({
      url: `${baseUrl}/api/catalog`,
      method: 'GET',
    })
  }

  throw new Error('Modo remoto AVMD não reconhecido.')
}

async function processIntegrationEvents(limit = 10) {
  const result = await httpRequest({
    url: 'http://localhost:8787/api/integrations/process',
    method: 'POST',
    body: { limit: Math.max(1, Math.min(100, Number(limit || 10))) },
  })
  return result
}

async function delegateAgent(agentName, task, payload = {}) {
  const normalized = normalizeAgentName(agentName)
  const taskText = String(task || '').trim()
  if (!normalized) throw new Error('Agente não informado.')
  if (!taskText) throw new Error('Tarefa não informada.')

  if (normalized === 'vps' || normalized === 'remote_avmd' || normalized === 'avmd_remoto') {
    return await queryRemoteAvmd(payload)
  }

  if (normalized === 'local_avmd' || normalized === 'avmd_local' || normalized === 'avmd') {
    return await queryAvmd(payload)
  }

  if (normalized === 'filesystem' || normalized === 'files' || normalized === 'arquivo' || normalized === 'arquivos') {
    const mode = String(payload.mode || 'list').trim()
    if (mode === 'read') {
      return await fs.readFile(String(payload.path || ''), 'utf8')
    }
    if (mode === 'search') {
      return await runSearch(String(payload.query || taskText), String(payload.path || config.workspacePath))
    }
    const target = String(payload.path || '.').trim()
    const resolved = safeJoinWithin(config.workspacePath, target)
    const entries = await fs.readdir(resolved, { withFileTypes: true })
    return entries.slice(0, 50).map(entry => `${entry.isDirectory() ? '[DIR]' : '[ARQ]'} ${entry.name}`).join('\n') || '(vazio)'
  }

  if (normalized === 'vscode' || normalized === 'editor' || normalized === 'code') {
    const target = String(payload.path || config.workspacePath).trim()
    const resolved = resolveProjectTarget(target)
    await openWorkspaceInVSCode(resolved)
    return { ok: true, workspace: resolved }
  }

  const route = resolveAgentRoute(normalized)
  if (!route) {
    throw new Error(`Agente "${agentName}" não configurado.`)
  }

  const response = await fetch(route, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agent: normalized, task: taskText, payload }),
  })
  const text = await response.text()
  return {
    status: response.status,
    ok: response.ok,
    body: text.length > 3500 ? `${text.slice(0, 3500)}\n...[cortado]` : text,
  }
}

async function handleDecision(chatId, decision, state) {
  const action = String(decision.action || 'answer').trim()
  const reply = String(decision.reply || '').trim()
  const args = decision.args && typeof decision.args === 'object' ? decision.args : {}
  const needsConfirmation = Boolean(decision.needs_confirmation)

  if (action === 'answer' || action === 'clarify') {
    await sendMessage(chatId, reply || 'Preciso de mais detalhes.')
    return
  }

  if (action === 'remember') {
    const note = String(args.note || reply).trim()
    if (note) {
      state.notes = [...(state.notes || []), { at: new Date().toISOString(), note }].slice(-40)
      await saveState(state)
      await sendMessage(chatId, reply || 'Anotado.')
      return
    }
  }

  if (action === 'switch_project') {
    const requested = String(args.target || args.path || args.project || '').trim()
    if (!requested) {
      await sendMessage(chatId, 'Informe o projeto ou caminho que devo abrir.')
      return
    }
    const resolved = await setCurrentWorkspace(requested)
    await openWorkspaceInVSCode(resolved).catch(error => {
      throw new Error(`Projeto trocado, mas não consegui abrir o VS Code: ${error instanceof Error ? error.message : String(error)}`)
    })
    await sendMessage(chatId, reply ? `${reply}\nProjeto ativo: ${resolved}` : `Projeto ativo: ${resolved}`)
    return
  }

  if (action === 'wake_computer') {
    const requested = String(args.target || args.alias || args.mac || '').trim()
    if (!requested) {
      await sendMessage(chatId, 'Informe qual computador devo acordar.')
      return
    }
    const target = resolveWolTarget(requested)
    await sendWakeOnLan(target)
    await sendMessage(chatId, reply ? `${reply}\nWake-on-LAN enviado para ${target.alias}.` : `Wake-on-LAN enviado para ${target.alias}.`)
    return
  }

  if (action === 'process_integration_events') {
    const limit = Number(args.limit || 10)
    const result = await processIntegrationEvents(limit)
    await sendMessage(chatId, `${reply || 'Processamento concluído.'}\nHTTP ${result.status} ${result.ok ? 'OK' : 'ERRO'}\n${result.body}`.trim())
    return
  }

  if (action === 'delegate_agent') {
    const agent = String(args.agent || args.target || '').trim()
    const task = String(args.task || args.message || reply || '').trim()
    const payload = args.payload && typeof args.payload === 'object' ? args.payload : { text: task }
    const result = await delegateAgent(agent, task, payload)
    const formatted = typeof result === 'string' ? result : JSON.stringify(result, null, 2)
    await sendMessage(chatId, `${reply || `Agente ${agent} acionado.`}\n\n${formatted}`.trim())
    return
  }

  if (action === 'list_files') {
    const requested = String(args.path || '.').trim()
    const target = safeJoinWithin(config.workspacePath, requested)
    const entries = await fs.readdir(target, { withFileTypes: true })
    const listing = entries.slice(0, 50).map(entry => `${entry.isDirectory() ? '[DIR]' : '[ARQ]'} ${entry.name}`).join('\n') || '(vazio)'
    await sendMessage(chatId, reply ? `${reply}\n\n${listing}` : listing)
    return
  }

  if (action === 'search_repo') {
    const query = String(args.query || '').trim()
    const target = args.path ? String(args.path) : config.workspacePath
    const result = await runSearch(query, target)
    await sendMessage(chatId, reply ? `${reply}\n\n${result.output}` : result.output)
    return
  }

  if (action === 'read_file') {
    const requested = String(args.path || '').trim()
    if (!requested) {
      await sendMessage(chatId, 'Informe o arquivo que devo ler.')
      return
    }
    const target = path.isAbsolute(requested) ? requested : safeJoinWithin(config.workspacePath, requested)
    const content = await fs.readFile(target, 'utf8')
    const trimmed = content.length > 3500 ? `${content.slice(0, 3500)}\n...[cortado]` : content
    await sendMessage(chatId, reply ? `${reply}\n\n${trimmed}` : trimmed)
    return
  }

  if (action === 'write_file') {
    const requested = String(args.path || '').trim()
    const content = String(args.content || '')
    if (!requested) {
      await sendMessage(chatId, 'Informe o caminho do arquivo e o conteúdo.')
      return
    }
    const pendingId = Math.random().toString(16).slice(2, 10)
    state.pending[pendingId] = {
      type: 'write_file',
      path: requested,
      content,
      createdAt: new Date().toISOString(),
    }
    await saveState(state)
    if (needsConfirmation || content.length > 8000 || /(^|\/)(\.env|.*\.key|.*\.pem)$/i.test(requested)) {
      await sendMessage(chatId, `${reply || 'Escrita pendente de confirmação.'}\nUse /ok ${pendingId} para gravar o arquivo.`)
      return
    }
    const resolved = await writeFileWithinWorkspace(requested, content)
    await sendMessage(chatId, reply ? `${reply}\nArquivo salvo: ${resolved}` : `Arquivo salvo: ${resolved}`)
    delete state.pending[pendingId]
    await saveState(state)
    return
  }

  if (action === 'apply_patch') {
    const patch = String(args.patch || '')
    if (!patch.trim()) {
      await sendMessage(chatId, 'O patch está vazio.')
      return
    }
    const pendingId = Math.random().toString(16).slice(2, 10)
    state.pending[pendingId] = {
      type: 'apply_patch',
      patch,
      createdAt: new Date().toISOString(),
    }
    await saveState(state)
    if (needsConfirmation || patch.length > 10000) {
      await sendMessage(chatId, `${reply || 'Patch pendente de confirmação.'}\nUse /ok ${pendingId} para aplicar.`)
      return
    }
    const result = await applyPatchText(patch)
    await sendMessage(chatId, `${reply || ''}\nExitCode: ${result.exitCode}\n${result.output}`.trim())
    delete state.pending[pendingId]
    await saveState(state)
    return
  }

  if (action === 'git_status') {
    const result = await runGit(['status', '--short'])
    await sendMessage(chatId, reply ? `${reply}\n\n${result.output}` : result.output)
    return
  }

  if (action === 'git_diff') {
    const diffArgs = ['diff']
    const target = String(args.path || '').trim()
    if (target) diffArgs.push('--', target)
    const result = await runGit(diffArgs)
    await sendMessage(chatId, reply ? `${reply}\n\n${result.output}` : result.output)
    return
  }

  if (action === 'n8n_webhook') {
    if (!config.n8nWebhookUrl && !args.url) {
      await sendMessage(chatId, 'Webhook do n8n não configurado.')
      return
    }
    const webhookUrl = String(args.url || config.n8nWebhookUrl).trim()
    const payload = args.payload && typeof args.payload === 'object' ? args.payload : { message: reply }
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    await sendMessage(chatId, response.ok ? (reply || 'Tarefa enviada ao n8n.') : `Falha ao chamar o n8n: HTTP ${response.status}`)
    return
  }

  if (action === 'http_request') {
    const result = await httpRequest({
      url: args.url,
      method: args.method,
      headers: args.headers,
      body: args.body,
    })
    await sendMessage(chatId, `${reply || ''}\nHTTP ${result.status} ${result.ok ? 'OK' : 'ERRO'}\n${result.body}`.trim())
    return
  }

  if (action === 'avmd_query') {
    let result
    try {
      result = await queryAvmd(args)
    } catch {
      result = await queryRemoteAvmd(args)
    }
    const formatted = typeof result === 'string' ? result : JSON.stringify(result, null, 2)
    await sendMessage(chatId, `${reply || 'Consulta concluída.'}\n\n${formatted}`.trim())
    return
  }

  if (action === 'remote_avmd_query') {
    const result = await queryRemoteAvmd(args)
    const formatted = typeof result === 'string' ? result : JSON.stringify(result, null, 2)
    await sendMessage(chatId, `${reply || 'Consulta remota concluída.'}\n\n${formatted}`.trim())
    return
  }

  if (action === 'run_command') {
    const command = String(args.command || '').trim()
    if (!command) {
      await sendMessage(chatId, 'Não recebi o comando para executar.')
      return
    }
    if (/(^|[\s;])(node|npm|npx)\s+.*\.ts\b/i.test(command)) {
      await sendMessage(chatId, 'Não vou executar arquivo .ts direto com Node. Use o endpoint de processamento local ou um script compilado.')
      return
    }
    const pendingId = Math.random().toString(16).slice(2, 10)
    state.pending[pendingId] = {
      type: 'run_command',
      command,
      createdAt: new Date().toISOString(),
    }
    await saveState(state)
    if (needsConfirmation || commandLooksDangerous(command)) {
      await sendMessage(chatId, `${reply || 'Comando pendente de confirmação.'}\nUse /ok ${pendingId} para executar.\n\n${command}`)
      return
    }
    const result = await runPowerShell(command)
    await sendMessage(chatId, `${reply || ''}\nExitCode: ${result.exitCode}\n${result.output}`.trim())
    delete state.pending[pendingId]
    await saveState(state)
    return
  }

  await sendMessage(chatId, reply || 'Não consegui executar essa ação.')
}

async function handleSlashCommand(chatId, text, state) {
  const [cmd, ...rest] = text.trim().split(/\s+/)
  const argText = rest.join(' ').trim()

  if (cmd === '/start' || cmd === '/help' || cmd === '/ajuda') {
    await sendMessage(chatId, [
      'Modo RAG ativo.',
      'Você pode falar normalmente, como se estivesse conversando comigo.',
      '',
      'Comandos rápidos:',
      '/status',
      '/pwd',
      '/ls [pasta]',
      '/cat <arquivo>',
      '/run <comando>',
      '/ok <id>',
      '/cancel <id>',
    ].join('\n'))
    return
  }

  if (cmd === '/status') {
    const avmd = await queryAvmd({ mode: 'status' }).catch(error => ({ error: error instanceof Error ? error.message : String(error) }))
    const payload = typeof avmd === 'object' && avmd && 'error' in avmd
      ? `AVMD: ${avmd.error}`
      : `AVMD consultado com sucesso.`
    await sendMessage(chatId, [
      'Agente RAG ativo',
      `Workspace: ${config.workspacePath}`,
      `Arquivos de conhecimento indexáveis: em tempo real`,
      `Pendências: ${Object.keys(state.pending || {}).length}`,
      payload,
    ].join('\n'))
    return
  }

  if (cmd === '/pwd') {
    await sendMessage(chatId, config.workspacePath)
    return
  }

  if (cmd === '/project' || cmd === '/abrir' || cmd === '/open') {
    if (!argText) {
      const aliases = Object.entries(config.projectAliases)
        .map(([alias, target]) => `${alias} => ${target}`)
        .join('\n') || '(nenhum alias configurado)'
      await sendMessage(chatId, [
        `Workspace atual: ${config.workspacePath}`,
        '',
        'Uso:',
        '/project avmd',
        '/project C:\\caminho\\do\\projeto',
        '',
        'Aliases configurados:',
        aliases,
      ].join('\n'))
      return
    }

    const resolved = await setCurrentWorkspace(argText)
    await openWorkspaceInVSCode(resolved)
    await sendMessage(chatId, `Projeto ativo: ${resolved}`)
    return
  }

  if (cmd === '/wake' || cmd === '/wakeonlan' || cmd === '/acordar') {
    if (!argText) {
      const aliases = Object.entries(config.wolTargets)
        .map(([alias, target]) => `${alias} => ${String(target?.mac || '').trim()}`)
        .join('\n') || '(nenhum destino configurado)'
      await sendMessage(chatId, [
        'Uso:',
        '/wake pc',
        '/wake AA:BB:CC:DD:EE:FF',
        '',
        'Destinos Wake-on-LAN:',
        aliases,
      ].join('\n'))
      return
    }

    const target = resolveWolTarget(argText)
    await sendWakeOnLan(target)
    await sendMessage(chatId, `Wake-on-LAN enviado para ${target.alias}.`)
    return
  }

  if (cmd === '/ls') {
    const target = argText ? (path.isAbsolute(argText) ? argText : safeJoinWithin(config.workspacePath, argText)) : config.workspacePath
    const entries = await fs.readdir(target, { withFileTypes: true })
    const listing = entries.slice(0, 50).map(entry => `${entry.isDirectory() ? '[DIR]' : '[ARQ]'} ${entry.name}`).join('\n') || '(vazio)'
    await sendMessage(chatId, listing)
    return
  }

  if (cmd === '/cat') {
    if (!argText) {
      await sendMessage(chatId, 'Use /cat caminho/do/arquivo')
      return
    }
    const target = path.isAbsolute(argText) ? argText : safeJoinWithin(config.workspacePath, argText)
    const content = await fs.readFile(target, 'utf8')
    await sendMessage(chatId, content.length > 3500 ? `${content.slice(0, 3500)}\n...[cortado]` : content)
    return
  }

  if (cmd === '/run') {
    if (!argText) {
      await sendMessage(chatId, 'Use /run comando')
      return
    }
    const pendingId = Math.random().toString(16).slice(2, 10)
    state.pending[pendingId] = {
      type: 'run_command',
      command: argText,
      createdAt: new Date().toISOString(),
    }
    await saveState(state)
    if (commandLooksDangerous(argText)) {
      await sendMessage(chatId, `Comando pendente de confirmação. Use /ok ${pendingId} para executar.\n\n${argText}`)
      return
    }
    const result = await runPowerShell(argText)
    await sendMessage(chatId, `ExitCode: ${result.exitCode}\n${result.output}`)
    delete state.pending[pendingId]
    await saveState(state)
    return
  }

  if (cmd === '/reindex') {
    const files = await refreshKnowledgeFiles()
    await sendMessage(chatId, `RAG reindexado. Arquivos disponíveis: ${files.length}`)
    return
  }

  if (cmd === '/process-events' || cmd === '/processar-eventos' || cmd === '/events') {
    const limit = argText ? Number(argText) : 10
    const result = await processIntegrationEvents(Number.isFinite(limit) ? limit : 10)
    await sendMessage(chatId, `Processamento concluído.\nHTTP ${result.status} ${result.ok ? 'OK' : 'ERRO'}\n${result.body}`.trim())
    return
  }

  if (cmd === '/ok') {
    const id = argText.split(/\s+/)[0]
    if (!id || !state.pending[id]) {
      await sendMessage(chatId, 'Comando pendente não encontrado.')
      return
    }
    const pending = state.pending[id]
    if (pending.type === 'write_file') {
      const resolved = await writeFileWithinWorkspace(String(pending.path || ''), String(pending.content || ''))
      delete state.pending[id]
      await saveState(state)
      await sendMessage(chatId, `Arquivo salvo: ${resolved}`)
      return
    }
    if (pending.type === 'apply_patch') {
      const result = await applyPatchText(String(pending.patch || ''))
      delete state.pending[id]
      await saveState(state)
      await sendMessage(chatId, `ExitCode: ${result.exitCode}\n${result.output}`)
      return
    }
    const result = await runPowerShell(String(pending.command || ''))
    delete state.pending[id]
    await saveState(state)
    await sendMessage(chatId, `ExitCode: ${result.exitCode}\n${result.output}`)
    return
  }

  if (cmd === '/cancel') {
    const id = argText.split(/\s+/)[0]
    if (id && state.pending[id]) {
      delete state.pending[id]
      await saveState(state)
      await sendMessage(chatId, `Cancelado: ${id}`)
      return
    }
    await sendMessage(chatId, 'Nada para cancelar.')
    return
  }

  await sendMessage(chatId, 'Comando não reconhecido. Use /help.')
}

async function main() {
  if (!config.botToken) throw new Error('TELEGRAM_BOT_TOKEN não configurado.')
  if (!config.adminChatIds.length) throw new Error('TELEGRAM_ADMIN_CHAT_IDS não configurado.')
  if (!config.openaiApiKey) throw new Error('OPENAI_API_KEY não configurada.')

  const state = await loadState()
  if (!state.pending) state.pending = {}
  if (!state.notes) state.notes = []

  await refreshKnowledgeFiles()
  console.log(`[telegram-rag-agent] Iniciado com ${knowledgeFiles.length} arquivos de conhecimento.`)
  console.log(`[telegram-rag-agent] Workspace: ${config.workspacePath}`)
  console.log(`[telegram-rag-agent] Estado: ${config.statePath}`)

  let offset = Number(state.offset || 0)
  while (true) {
    const updates = await getUpdates(offset)
    if (!updates) {
      await new Promise(resolve => setTimeout(resolve, 2000))
      continue
    }

    for (const update of updates) {
      offset = Number(update.update_id || offset) + 1
      state.offset = offset
      await saveState(state)

      const message = update.message
      const chatId = message?.chat?.id
      const text = normalizeText(message?.text)
      if (!chatId || !text || !isAdminChat(chatId)) continue

      try {
        if (text.startsWith('/')) {
          await handleSlashCommand(chatId, text, state)
        } else {
          const { decision, retrieval } = await respondNaturalLanguage(text, state, chatId)
          if (retrieval.length) {
            const refs = retrieval.map(item => `- ${item.file}`).join('\n')
            if (!decision.reply) {
              decision.reply = `Encontrei material relacionado:\n${refs}`
            }
          }
          await handleDecision(chatId, decision, state)
        }
      } catch (error) {
        const messageText = error instanceof Error ? error.message : 'Erro desconhecido'
        await sendMessage(chatId, `Falha ao processar pedido: ${messageText}`)
      }
    }
  }
}

main().catch(error => {
  console.error('[telegram-rag-agent] Falha fatal:', error)
  process.exitCode = 1
})
