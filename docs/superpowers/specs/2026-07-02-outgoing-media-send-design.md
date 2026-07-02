# Envio real de midia (audio/anexo) no Chat ao Vivo

## Problema

O botao de gravar audio e o de anexar arquivo em `ChatInboxCRM.tsx`
(funcao `sendHumanAttachment`) nunca enviaram o arquivo de verdade.
Eles apenas mandam uma legenda de texto (`"📎 nome_do_arquivo"`) via
`POST /message/sendText/{instance}` da Evolution API — o blob de
audio/arquivo gravado no navegador e descartado. A mensagem salva em
`crm_chat_messages` fica sem `mime_type`, `file_name` e `media_url`,
entao a bolha da conversa cai no fallback de texto puro (nao
clicavel, nao reproduzivel).

## Contexto tecnico confirmado

- Evolution API **v2.3.7** em `api.mantovan.com.br` (`GET /` retornou
  `{"version":"2.3.7", ...}`).
- Endpoints de envio de midia da Evolution API v2:
  - `POST /message/sendWhatsAppAudio/{instance}` — body
    `{ number, audio: "<base64 puro>", encoding: true }`. Sem
    variante por URL documentada.
  - `POST /message/sendMedia/{instance}` — body
    `{ number, mediatype: "image"|"video"|"document", mimetype,
    media, fileName, caption }`. `media` aceita base64 puro (sem
    prefixo `data:...;base64,`) para arquivos pequenos (~3MB) ou uma
    URL https publica para arquivos maiores.
- Infra de storage ja existe e funciona:
  - `POST /api/chat/upload` ja salva bytes em disco
    (`saveFile`/`buildStoredPath`) e cria registro via
    `fileRepository.create(...)`.
  - `GET /api/chat/files/:id` ja serve o arquivo publicamente (sem
    autenticacao), com `Content-Type` correto — pode ser usado como
    URL publica para a Evolution API buscar arquivos grandes.
- Mensagens de texto enviadas (`POST /api/chat/send`, ja funcional)
  seguem o padrao: enviam via Evolution, depois gravam um registro em
  `communication_events` com payload no formato
  `{ content, fromMe, mimeType, fileName, mediaUrl, messageType,
  pushName, quoted, provider_payload }`. O trigger
  `fn_sync_communication_event()` espelha isso em `crm_chat_messages`
  (sem enriquecer campos de midia — por isso o frontend le o
  `communication_events.payload` bruto diretamente via
  `parseEvolutionEventMessages`, que ja foi corrigido nesta sessao
  para exibir midia com `mimeType`/`fileName`/`mediaUrl`).

## Escopo

Cobre os dois fluxos que passam por `sendHumanAttachment`:
- Audio gravado pelo operador (`MediaRecorder`, tipicamente
  `audio/webm;codecs=opus` no Chrome).
- Arquivo anexado manualmente (imagem, video, documento).

Fora de escopo (nesta rodada): conversao de codec de audio (ex.
transcodificar `webm` para `ogg/opus` via ffmpeg). Risco aceito: pode
nao renderizar como bolha de "nota de voz" nativa do WhatsApp em
todos os casos, mas deve tocar como arquivo de audio comum.

## Arquitetura

### Novo endpoint: `POST /api/chat/send-media`

Substitui a chamada de texto-so que `sendHumanAttachment` faz hoje.

**Request body:**
```json
{
  "instance_name": "atendimento",
  "conversation_id": "5511999999999@s.whatsapp.net",
  "destination_number": "5511999999999",
  "file_base64": "<base64 puro, sem prefixo data:>",
  "file_name": "audio_1783012188647.webm",
  "mime_type": "audio/webm;codecs=opus",
  "caption": null
}
```

**Fluxo no backend:**
1. Validar campos obrigatorios e tamanho (reaproveita o limite de
   50MB ja usado em `/api/chat/upload`).
2. Decodificar base64 -> Buffer, salvar via `saveFile` +
   `fileRepository.create(...)` (mesmo padrao de `/api/chat/upload`).
   Isso da um `media_url` proprio e duradouro:
   `/api/chat/files/{fileRecord.id}`.
3. Determinar categoria por `mime_type`:
   - `audio/*` -> `POST {base_url}/message/sendWhatsAppAudio/{instance}`
     com `{ number, audio: file_base64, encoding: true }`.
   - `image/*`, `video/*`, outros -> `POST
     {base_url}/message/sendMedia/{instance}` com `mediatype`
     derivado do mime (`image`, `video`, `document` como default),
     usando `media: file_base64` se o arquivo for pequeno (<= 3MB) ou
     `media: <url absoluta de /api/chat/files/:id>` se for maior.
4. Se a chamada a Evolution API falhar, responder erro e **nao**
   gravar nada em `communication_events` (nao persiste mensagem que
   nao foi enviada).
5. Se a chamada tiver sucesso, gravar um evento em
   `communication_events` com o mesmo formato usado por
   `/api/chat/send`:
   ```json
   {
     "content": "<caption ou nome do arquivo>",
     "fromMe": true,
     "messageId": "<id retornado pela Evolution, se houver>",
     "messageType": "audioMessage | imageMessage | videoMessage | documentMessage",
     "mimeType": "<mime_type recebido>",
     "fileName": "<file_name recebido>",
     "mediaUrl": "/api/chat/files/{fileRecord.id}",
     "pushName": "Operador",
     "provider_payload": "<resposta da Evolution API>"
   }
   ```
6. Responder `{ ok: true, messageId, mediaUrl }` para o frontend.

### Frontend (`ChatInboxCRM.tsx`)

`sendHumanAttachment` passa a:
1. Converter o `Blob`/`File` para base64 (`FileReader.readAsDataURL`
   + strip do prefixo `data:...;base64,`).
2. Chamar `POST /api/chat/send-media` no lugar do `POST /chat/send`
   atual.
3. Manter a mensagem otimista (blob URL local) ate a resposta do
   backend chegar; em caso de erro, reverter exatamente como ja faz
   hoje.
4. Apos sucesso, recarregar mensagens (`loadMessages`) como ja
   acontece hoje — o novo evento ja vem com `mimeType`/`mediaUrl`
   corretos, entao a bolha de audio/imagem/documento (corrigida nesta
   sessao) ja deve renderizar como clicavel/reproduzivel
   automaticamente, sem mudanca adicional em `MessageRow`.

## Erros e limites

- Reaproveita o limite de 50MB ja usado em `/api/chat/upload`.
- Se a Evolution API retornar erro (ex. instancia desconectada), o
  endpoint responde erro e o frontend mostra a mensagem de falha que
  ja existe (`setActionError`), sem persistir nada.
- Sem retry automatico — falha visivel ao operador, que pode tentar
  de novo.

## Fora de escopo / riscos aceitos

- Conversao de codec de audio (ffmpeg) — pode ser adicionada depois
  se o audio gravado nao tocar como nota de voz nativa em algum
  navegador/instancia.
- Compressao/otimizacao de imagem antes do envio.
- Suporte a envio de multiplos arquivos de uma vez.
