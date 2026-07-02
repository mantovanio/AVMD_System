# Envio real de midia (audio/anexo) no Chat ao Vivo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer o botao de gravar audio e o de anexar arquivo no Chat ao Vivo (`ChatInboxCRM.tsx`) enviarem o arquivo de verdade para o WhatsApp via Evolution API, em vez de so uma legenda de texto — para que a mensagem fique clicavel/reproduzivel depois de enviada, igual no WhatsApp.

**Architecture:** Novo endpoint `POST /api/chat/send-media` no backend: salva o arquivo no storage ja existente (`saveFile`/`fileRepository`, mesmo padrao de `/api/chat/upload`), envia para a Evolution API (`sendWhatsAppAudio` para audio, `sendMedia` para imagem/video/documento) e, se der certo, grava um `communication_events` com `mimeType`/`fileName`/`mediaUrl` no mesmo formato que o webhook de entrada ja usa (que o frontend ja sabe renderizar, corrigido em sessao anterior). O frontend so muda a implementacao interna de `sendHumanAttachment` — os dois botoes (audio e anexo) ja chamam essa funcao, entao nao precisam mudar.

**Tech Stack:** Node/TypeScript (backend), React/TypeScript (frontend), Evolution API v2.3.7, Postgres (Aiven).

**Nota sobre testes:** este projeto nao tem suite de testes automatizada configurada (ver `CLAUDE.md`: validacao minima e `npm run lint` + `npm run build`). Os passos de verificacao abaixo usam `tsc`/build e chamadas `curl` manuais em vez de testes unitarios, seguindo o padrao ja usado neste repositorio.

---

### Task 1: Config de URL publica da API (backend)

**Files:**
- Modify: `backend/src/config/env.ts`

- [ ] **Step 1: Adicionar `publicApiBaseUrl` ao `BackendConfig`**

Em `backend/src/config/env.ts`, adicionar o campo ao tipo e ao loader:

```ts
export type BackendConfig = {
  port: number
  databaseUrl: string
  corsOrigin: string
  n8nWebhookUrl: string
  n8nEmailSendUrl: string
  clerkSecretKey: string
  publicApiBaseUrl: string
  // Canal de atendimento humano (dia a dia, sem IA)
  evolutionAtendimento: EvolutionInstanceConfig
  // Canal CertiID — renovações de certificados (com IA)
  evolutionCertiid: EvolutionInstanceConfig
}
```

E dentro de `loadConfig()`, adicionar a linha (mantendo o restante igual):

```ts
    clerkSecretKey: env('CLERK_SECRET_KEY'),
    publicApiBaseUrl: env('PUBLIC_API_BASE_URL', 'https://api.certiid.mantovan.com.br'),
```

- [ ] **Step 2: Verificar compilacao**

Run: `npm run build:backend`
Expected: termina sem erros (`tsc -p backend/tsconfig.json` sem output de erro).

- [ ] **Step 3: Commit**

```bash
git add backend/src/config/env.ts
git commit -m "feat(backend): adiciona publicApiBaseUrl para montar URLs absolutas de arquivo"
```

---

### Task 2: Endpoint `POST /api/chat/send-media`

**Files:**
- Modify: `backend/src/routes/chatRoutes.ts`

- [ ] **Step 1: Adicionar as funcoes auxiliares de midia**

Logo apos a funcao `sendEvolutionTextMessage` (que termina por volta da linha 298, antes de `export async function handleChatRoutes`), adicionar:

```ts
type MediaCategory = 'audio' | 'image' | 'video' | 'document'

function mediaCategoryFromMime(mimeType: string): MediaCategory {
  if (mimeType.startsWith('audio/')) return 'audio'
  if (mimeType.startsWith('image/')) return 'image'
  if (mimeType.startsWith('video/')) return 'video'
  return 'document'
}

function messageTypeFromCategory(category: MediaCategory): string {
  switch (category) {
    case 'audio': return 'audioMessage'
    case 'image': return 'imageMessage'
    case 'video': return 'videoMessage'
    default: return 'documentMessage'
  }
}

async function sendEvolutionMediaMessage(
  integrationRepo: ExternalIntegrationRepository,
  input: {
    instanceName?: string | null
    destinationNumber: string
    category: MediaCategory
    mimeType: string
    fileName: string
    mediaValue: string
    caption?: string | null
  },
) {
  const integration = await resolveIntegration(integrationRepo, input.instanceName)
  if (!integration?.base_url || !integration?.api_token || !integration?.instance_name) {
    return { ok: false, error: 'Nenhuma integracao WhatsApp ativa configurada.', status: 422, payload: null as JsonRecord | null, instanceName: null as string | null }
  }

  const baseUrl = cleanBaseUrl(integration.base_url)
  let evolutionUrl: string
  let body: JsonRecord

  if (input.category === 'audio') {
    evolutionUrl = `${baseUrl}/message/sendWhatsAppAudio/${integration.instance_name}`
    body = { number: input.destinationNumber, audio: input.mediaValue, encoding: true }
  } else {
    evolutionUrl = `${baseUrl}/message/sendMedia/${integration.instance_name}`
    body = {
      number: input.destinationNumber,
      mediatype: input.category,
      mimetype: input.mimeType,
      media: input.mediaValue,
      fileName: input.fileName,
      ...(input.caption ? { caption: input.caption } : {}),
    }
  }

  const response = await fetch(evolutionUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: integration.api_token },
    body: JSON.stringify(body),
  })

  const payload = await response.json().catch(() => ({ status: response.status })) as JsonRecord
  if (!response.ok) {
    return { ok: false, error: `Evolution retornou HTTP ${response.status}`, status: 502, payload, instanceName: integration.instance_name }
  }

  return { ok: true, error: null, status: 200, payload, instanceName: integration.instance_name }
}
```

- [ ] **Step 2: Adicionar a rota**

Dentro de `handleChatRoutes`, logo apos o bloco `if (method === 'POST' && url === '/api/chat/upload') { ... }` (termina por volta da linha 762, antes do comentario `// ── Catálogo IA`), adicionar:

```ts
  if (method === 'POST' && url === '/api/chat/send-media') {
    const body = await readJson<Record<string, unknown>>(req)
    const conversationId = asString(body.conversation_id)
    const destinationNumber = normalizePhoneDigits(asString(body.destination_number))
    const fileName = asString(body.file_name)
    const mimeType = asString(body.mime_type) || 'application/octet-stream'
    const fileBase64 = asString(body.file_base64)
    const caption = typeof body.caption === 'string' && body.caption.trim() ? body.caption.trim() : null
    const instanceName = asString(body.instance_name) || null

    if (!conversationId) {
      writeJson(res, 400, { ok: false, error: 'conversation_id obrigatorio.' }, corsOrigin)
      return true
    }
    if (!destinationNumber) {
      writeJson(res, 400, { ok: false, error: 'destination_number obrigatorio.' }, corsOrigin)
      return true
    }
    if (!fileName) {
      writeJson(res, 400, { ok: false, error: 'file_name obrigatorio.' }, corsOrigin)
      return true
    }
    if (!fileBase64) {
      writeJson(res, 400, { ok: false, error: 'file_base64 obrigatorio.' }, corsOrigin)
      return true
    }

    let buffer: Buffer
    try {
      buffer = Buffer.from(fileBase64, 'base64')
    } catch {
      writeJson(res, 400, { ok: false, error: 'file_base64 invalido.' }, corsOrigin)
      return true
    }

    const maxBytes = 50 * 1024 * 1024
    if (buffer.length > maxBytes) {
      writeJson(res, 400, { ok: false, error: 'Arquivo excede o limite de 50MB.' }, corsOrigin)
      return true
    }

    const storedPath = buildStoredPath(conversationId, fileName)
    saveFile(storedPath, buffer)
    const fileRecord = await fileRepository.create({
      conversation_id: conversationId,
      original_name: fileName,
      stored_path: storedPath,
      mime_type: mimeType,
      size_bytes: buffer.length,
      uploaded_by: null,
    })

    const mediaUrl = `/api/chat/files/${fileRecord.id}`
    const category = mediaCategoryFromMime(mimeType)
    // Evolution API so aceita base64 direto ate ~3MB para imagem/video/documento;
    // acima disso, manda a URL publica do proprio arquivo (audio nao tem opcao de URL).
    const useUrl = category !== 'audio' && buffer.length > 3 * 1024 * 1024
    const mediaValue = useUrl ? `${cleanBaseUrl(config.publicApiBaseUrl)}${mediaUrl}` : fileBase64

    const sendResult = await sendEvolutionMediaMessage(externalIntegrationRepository, {
      instanceName,
      destinationNumber,
      category,
      mimeType,
      fileName,
      mediaValue,
      caption,
    })

    if (!sendResult.ok) {
      writeJson(res, sendResult.status, { ok: false, error: sendResult.error, detail: sendResult.payload }, corsOrigin)
      return true
    }

    const messageId = parseMessageId(sendResult.payload)
    const remoteJid = buildRemoteJid(destinationNumber)

    await communicationEventRepository.create({
      source: 'evolution',
      event_type: 'message_sent',
      external_id: messageId,
      conversation_id: remoteJid,
      lead_id: null,
      contact: destinationNumber,
      payload: {
        content: caption ?? fileName,
        fromMe: true,
        messageId,
        messageType: messageTypeFromCategory(category),
        mimeType,
        fileName,
        mediaUrl,
        pushName: 'Operador',
        provider_payload: sendResult.payload,
      },
    })

    writeJson(res, 200, { ok: true, messageId, mediaUrl }, corsOrigin)
    return true
  }

```

- [ ] **Step 3: Verificar compilacao**

Run: `npm run build:backend`
Expected: sem erros.

- [ ] **Step 4: Testar validacao de campos obrigatorios localmente**

Suba o backend local (`npm run start:backend`, com `backend/.env.local` configurado) e rode:

```bash
curl -s -w "\nSTATUS:%{http_code}\n" -X POST http://localhost:8787/api/chat/send-media \
  -H "Content-Type: application/json" \
  -d '{}'
```

Expected: `STATUS:400` com `{"ok":false,"error":"conversation_id obrigatorio."}`.

```bash
curl -s -w "\nSTATUS:%{http_code}\n" -X POST http://localhost:8787/api/chat/send-media \
  -H "Content-Type: application/json" \
  -d '{"conversation_id":"11111111-1111-1111-1111-111111111111","destination_number":"5511999999999","file_name":"teste.txt"}'
```

Expected: `STATUS:400` com `{"ok":false,"error":"file_base64 obrigatorio."}`.

(Um teste de ponta a ponta real — que efetivamente chega no WhatsApp — so e possivel apos o deploy, contra uma instancia Evolution ativa e um numero real; isso fica para a verificacao manual no Task 5.)

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/chatRoutes.ts
git commit -m "feat(backend): adiciona POST /api/chat/send-media para enviar audio/anexo de verdade via Evolution API"
```

---

### Task 3: Frontend — `sendHumanAttachment` envia o arquivo de verdade

**Files:**
- Modify: `src/pages/ChatInboxCRM.tsx`

- [ ] **Step 1: Adicionar helper `blobToBase64`**

Perto das outras funcoes auxiliares de mime (`isImageMime`, `isAudioMime`, etc, por volta da linha 256), adicionar:

```ts
async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}
```

- [ ] **Step 2: Trocar a chamada de rede dentro de `sendHumanAttachment`**

Em `sendHumanAttachment` (por volta da linha 1686), o bloco `try` atual manda so texto:

```ts
    try {
      const caption = `📎 ${filename}`
      const response = await fetch(getApiUrl('/chat/send'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instance_name: integration.instance_name,
          conversation_id: `${destinationNumber}@s.whatsapp.net`,
          content: caption,
          lead_id: null,
        }),
      })

      const payload = await response.json() as { ok?: boolean; error?: string }
      if (!response.ok || !payload.ok) throw new Error(payload.error ?? 'Nao foi possivel enviar o anexo.')
    } catch (err) {
```

Substituir por:

```ts
    try {
      const fileBase64 = await blobToBase64(file)
      const response = await fetch(getApiUrl('/chat/send-media'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instance_name: integration.instance_name,
          conversation_id: selectedConversation.id,
          destination_number: destinationNumber,
          file_base64: fileBase64,
          file_name: filename,
          mime_type: finalMimeType,
        }),
      })

      const payload = await response.json() as { ok?: boolean; error?: string }
      if (!response.ok || !payload.ok) throw new Error(payload.error ?? 'Nao foi possivel enviar o anexo.')
    } catch (err) {
```

(O restante da funcao — bloco `catch` que reverte a mensagem otimista, `markConversationAsHuman`, `loadConversations`, `loadMessages`, `focusComposer` — permanece igual, sem mudanca.)

- [ ] **Step 3: Verificar compilacao**

Run: `npm run build`
Expected: build termina com `✓ built in ...`, sem erros de TypeScript.

- [ ] **Step 4: Commit**

```bash
git add src/pages/ChatInboxCRM.tsx
git commit -m "feat(chat): envia audio gravado e arquivos anexados de verdade via Evolution API"
```

---

### Task 4: Deploy e verificacao manual em producao

**Files:** nenhum (deploy + verificacao)

- [ ] **Step 1: Deploy**

Seguir o fluxo padrao ja usado nesta sessao: `git push origin main`, depois rodar o gate de deploy (`ops/scripts/vps-deploy-gate.sh` via SSH), conforme `DEPLOY-RAPIDO.md`.

- [ ] **Step 2: Confirmar backend saudavel**

```bash
curl -s -o /dev/null -w "PUBLIC:%{http_code}\n" https://api.certiid.mantovan.com.br/healthz
```

Expected: `PUBLIC:200`.

- [ ] **Step 3: Verificacao manual no navegador**

No Chat ao Vivo, abrir uma conversa com um contato de teste real (numero com WhatsApp valido), gravar um audio curto e enviar. Confirmar:
1. A mensagem aparece na conversa com bolha de audio (nao "📎 nome_do_arquivo").
2. Clicar em play toca o audio gravado.
3. O numero de teste recebe a mensagem no WhatsApp como nota de voz (ou pelo menos como arquivo de audio reproduzivel — ver ressalva de codec no spec).

Repetir o mesmo teste anexando uma imagem e um PDF pelo botao de anexo.

- [ ] **Step 4: Checar no banco que o evento foi gravado corretamente**

```bash
psql "$DATABASE_URL" -c "SELECT payload->>'messageType', payload->>'mimeType', payload->>'mediaUrl' FROM communication_events WHERE event_type = 'message_sent' ORDER BY created_at DESC LIMIT 3;"
```

Expected: as 3 linhas mais recentes (do teste do Step 3) com `mimeType`/`mediaUrl` preenchidos (nao vazios).

---

## Riscos conhecidos (nao cobertos por este plano)

- Codec de audio: o navegador grava em `webm/opus` (Chrome); a Evolution API pode nao renderizar isso como nota de voz nativa do WhatsApp em 100% dos casos. Se o Step 3 do Task 4 mostrar esse problema, sera necessario um passo extra de conversao (ex. ffmpeg no backend) — nao incluido aqui por YAGNI ate confirmar que e um problema real.
- Arquivos de audio grandes (> alguns MB) podem ser rejeitados pela Evolution API, que so documenta o metodo base64 para audio (sem alternativa de URL). Fora de escopo — nao esperado para notas de voz tipicas.
