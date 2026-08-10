# Guia de Correções de Segurança — AVMD System

> **Objetivo:** Este documento lista todas as vulnerabilidades encontradas na auditoria
> de segurança do AVMD System, com instruções passo a passo para correção.
> Cada item inclui: arquivo afetado, linha, risco, impacto da correção e como testar.

---

## Índice

1. [Remover `.env.production` do histórico Git](#1-remover-envproduction-do-histórico-git)
2. [Adicionar middleware de autenticação no backend](#2-adicionar-middleware-de-autenticação-no-backend)
3. [Ajustar frontend para enviar token Clerk](#3-ajustar-frontend-para-enviar-token-clerk)
4. [Validar assinatura de webhooks de pagamento](#4-validar-assinatura-de-webhooks-de-pagamento)
5. [Adicionar rate-limiting na recuperação de senha](#5-adicionar-rate-limiting-na-recuperação-de-senha)
6. [Melhorar política de senhas](#6-melhorar-política-de-senhas)
7. [Tornar CORS mais restritivo](#7-tornar-cors-mais-restritivo)
8. [Ocultar detalhes de erro em 500](#8-ocultar-detalhes-de-erro-em-500)
9. [Autenticar endpoints de WhatsApp e Evolution](#9-autenticar-endpoints-de-whatsapp-e-evolution)
10. [Corrigir token de sessão do Portal](#10-corrigir-token-de-sessão-do-portal)

---

## Ordem de Execução Recomendada

```
FASE 1 (Seguro, sem risco de quebra):
  → Item 1 (limpar Git)
  → Item 8 (esconder erros)
  → Item 6 (política de senhas)
  → Item 5 (rate-limiting)

FASE 2 (Requer coordenação frontend + backend):
  → Item 2 + Item 3 JUNTOS (middleware de auth + frontend)
  → Item 9 (auth nos endpoints WhatsApp/Evolution)

FASE 3 (Requer testes em sandbox):
  → Item 4 (webhooks de pagamento)
  → Item 7 (CORS)
  → Item 10 (sessão do Portal)
```

---

## 1. Remover `.env.production` do histórico Git

**Arquivo:** `.env.production` (raiz)
**Risco atual:** Chaves Supabase e Clerk versionadas — qualquer fork/ex-repo expõe credenciais
**Impacto da correção:** Zero funcional

### O que fazer

```bash
# Instalar BFG Repo-Cleaner (necessita Java)
# Download: https://rtyley.github.io/bfg-repo-cleaner/

# 1. Clonar o repositório como mirror
git clone --mirror https://github.com/USUARIO/AVMD_System.git AVMD_System-mirror

# 2. Remover .env.production do histórico
java -jar bfg.jar --delete-files .env.production AVMD_System-mirror

# 3. Limpar e fazer push
cd AVMD_System-mirror
git reflog expire --expire=now --all
git gc --prune=now --aggressive
git push
```

### Depois da limpeza

Adicionar ao `.gitignore` (já deve existir):
```
.env.production
```

### Como testar

```bash
git log --all --oneline -- ".env.production"
# Deve retornar vazio
```

---

## 2. Adicionar middleware de autenticação no backend

**Arquivos afetados:**
- `backend/src/server.ts` (entry point)
- Todas as rotas em `backend/src/routes/`

**Risco atual:** Qualquer pessoa com acesso à URL da API pode executar ações de admin
**Impacto da correção:** ALTO — se o frontend não enviar token, todas as telas param

### O que fazer

#### 2.1. Criar utilitário de verificação de token Clerk

Criar arquivo `backend/src/utils/authMiddleware.ts`:

```typescript
import { createClerkClient } from '@clerk/backend'
import type { IncomingMessage, ServerResponse } from 'node:http'

type AuthenticatedRequest = IncomingMessage & {
  auth?: {
    userId: string
    sessionId: string
    user?: Record<string, unknown>
  }
}

type ClerkErrorLike = {
  errors?: Array<{ message?: string }>
  message?: string
  status?: number
}

/**
 * Verifica o token Bearer do Clerk e anexa dados da sessão ao request.
 * Retorna true se autenticado, false caso contrário (já envia resposta 401).
 */
export async function requireAuth(
  req: IncomingMessage,
  res: ServerResponse,
  clerkSecretKey: string,
  corsOrigin: string,
): Promise<AuthenticatedRequest | null> {
  const authHeader = req.headers.authorization ?? ''
  const token = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : ''

  if (!token) {
    res.statusCode = 401
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Access-Control-Allow-Origin', corsOrigin)
    res.end(JSON.stringify({ ok: false, error: 'Token de autenticação obrigatório.' }))
    return null
  }

  try {
    const clerkClient = createClerkClient({ secretKey: clerkSecretKey })
    const session = await clerkClient.verifyToken(token)

    const authenticatedReq = req as AuthenticatedRequest
    authenticatedReq.auth = {
      userId: session.sub,
      sessionId: session.sid ?? '',
    }
    return authenticatedReq
  } catch (error) {
    const payload = error as ClerkErrorLike | undefined
    const message = payload?.message ?? 'Token inválido ou expirado.'

    res.statusCode = 401
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Access-Control-Allow-Origin', corsOrigin)
    res.end(JSON.stringify({ ok: false, error: message }))
    return null
  }
}

/**
 * Verifica se o usuário autenticado tem perfil de administrador.
 */
export async function requireAdmin(
  req: IncomingMessage,
  res: ServerResponse,
  clerkSecretKey: string,
  corsOrigin: string,
  profileRepository: { findById: (id: string) => Promise<{ perfil: string; status: string } | null> },
): Promise<AuthenticatedRequest | null> {
  const authReq = await requireAuth(req, res, clerkSecretKey, corsOrigin)
  if (!authReq) return null

  const profile = await profileRepository.findById(authReq.auth!.userId)
  if (!profile || profile.perfil !== 'admin' || profile.status !== 'ativo') {
    res.statusCode = 403
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Access-Control-Allow-Origin', corsOrigin)
    res.end(JSON.stringify({ ok: false, error: 'Acesso restrito a administradores.' }))
    return null
  }

  return authReq
}
```

#### 2.2. Aplicar middleware no server.ts

No `backend/src/server.ts`, adicionar verificação antes de cada grupo de rotas:

```typescript
import { requireAuth, requireAdmin } from './utils/authMiddleware.js'

// Dentro do handler do server, ANTES de cada rota protegida:

// Exemplo: rotas admin
const handledAdminUsers = await (async () => {
  if (req.url?.startsWith('/api/admin/users')) {
    const authReq = await requireAdmin(req, res, config.clerkSecretKey, config.corsOrigin, profileRepository)
    if (!authReq) return true
    // ... chamar handler com authReq em vez de req
    return handleAdminUsersRoutes(authReq, res, profileRepository, config.clerkSecretKey, config.corsOrigin)
  }
  return false
})()
if (handledAdminUsers) return

// Aplicar o mesmo padrão para:
// - /api/admin/password-recovery/*
// - /api/permissoes/*
// - /api/integrations/*
// - /api/integrations/events
// - /api/integrations/process
// - /api/evolution/connection/test
// - /api/evolution/webhook/configure
// - /api/whatsapp/send
// - /api/comercial/*
// - /api/engage/*
// - /api/catalogo/*
```

#### 2.3. Rotas que NÃO devem ter auth (públicas)

```
GET  /healthz
POST /api/checkout/context          (checkout público)
POST /api/checkout/submit           (checkout público)
POST /api/checkout/webhook/*        (webhooks de pagamento)
POST /api/webhooks/evolution        (webhook da Evolution)
POST /api/webhooks/telegram         (webhook do Telegram)
POST /api/portal/auth/request       (login do portal)
POST /api/portal/auth/verify        (verificação do portal)
POST /api/portal/overview           (dados do portal)
POST /api/portal/schedule-context   (agendamento do portal)
POST /api/portal/schedule           (agendamento do portal)
POST /api/auth/password-recovery/request  (recuperação de senha)
POST /api/auth/password-recovery/verify   (verificação de código)
POST /api/auth/register             (desativado, retorna 403)
```

### Como testar

1. Rodar `npm run build:backend` sem erros
2. Testar sem token: `curl http://localhost:8787/api/admin/users` → deve retornar 401
3. Testar com token inválido: `curl -H "Authorization: Bearer invalido" ...` → 401
4. Testar com token válido: deve retornar 200
5. Testar rotas públicas sem token: devem funcionar normalmente

---

## 3. Ajustar frontend para enviar token Clerk

**Arquivos afetados:**
- `src/lib/api.ts` (cliente HTTP do frontend)
- Qualquer arquivo que faça fetch ao backend

**Risco atual:** Após implementar item 2, o frontend perde acesso ao backend
**Impacto:** Todas as telas param se não enviar token

### O que fazer

#### 3.1. Modificar o cliente HTTP

No arquivo `src/lib/api.ts` (ou onde estiver o helper de fetch), adicionar o token Clerk:

```typescript
import { getSupabaseAccessToken } from '@/lib/supabase'

// Se já existe uma função fetchWithAuth ou similar, modificar:
async function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = await getSupabaseAccessToken() // já existe em supabase.ts

  const headers = new Headers(options.headers ?? {})
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  return fetch(url, {
    ...options,
    headers,
  })
}

// Se NÃO existe helper centralizado, criar um:
export async function backendFetch(url: string, options: RequestInit = {}): Promise<Response> {
  // Obter token Clerk via globalThis
  const clerk = globalThis as typeof globalThis & { Clerk?: { session?: { getToken: () => Promise<string | null> } } }
  const token = await clerk.Clerk?.session?.getToken()

  const headers = new Headers(options.headers ?? {})
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  const baseUrl = import.meta.env.VITE_API_BASE_URL || ''
  const fullUrl = url.startsWith('http') ? url : `${baseUrl}${url}`

  return fetch(fullUrl, { ...options, headers })
}
```

#### 3.2. Identificar todas as chamadas ao backend

```bash
grep -r "fetch(" src/ --include="*.ts" --include="*.tsx" | grep -i "api"
grep -r "VITE_API_BASE_URL" src/ --include="*.ts" --include="*.tsx"
```

Cada chamada `fetch('/api/...')` ou `fetch(\`${VITE_API_BASE_URL}/api/...\`)` precisa usar o novo helper `backendFetch`.

#### 3.3. Tratar erro 401 globalmente

No helper de fetch, tratar 401 para redirecionar ao login:

```typescript
const response = await fetch(fullUrl, { ...options, headers })

if (response.status === 401) {
  // Token expirado — redirecionar para login
  window.location.href = '/login'
  throw new Error('Sessão expirada. Faça login novamente.')
}

return response
```

### Como testar

1. `npm run lint` sem erros
2. `npm run build` sem erros
3. Abrir o sistema no browser → deve logar normalmente
4. Verificar no Network tab que requests ao backend têm header `Authorization: Bearer ...`
5. Testar todas as telas: Dashboard, Comercial, Chat, Configurações, etc.

---

## 4. Validar assinatura de webhooks de pagamento

**Arquivo:** `backend/src/routes/checkoutRoutes.ts`
**Linhas:** 32-41 (Safe2pay), 43-72 (Mercado Pago)
**Risco atual:** Webhooks falsos são aceitos — pagamentos fictícios são registrados
**Impacto:** Se a validação estiver errada, pagamentos legítimos não são registrados

### O que fazer

#### 4.1. Mercado Pago — validar assinatura

```typescript
import { createHmac } from 'node:crypto'

function verifyMercadoPagoSignature(
  payload: string,
  xSignature: string,
  xRequestId: string,
  webhookSecret: string,
): boolean {
  if (!webhookSecret || !xSignature) return false

  // Formato: ts=TIMESTAMP;v1=HASH
  const parts = Object.fromEntries(
    xSignature.split(',').map(p => p.split('='))
  )
  const timestamp = parts.ts ?? ''
  const hash = parts.v1 ?? ''

  const signedPayload = `${xRequestId}${timestamp}${payload}`
  const expectedHash = createHmac('sha256', webhookSecret)
    .update(signedPayload)
    .digest('hex')

  return hash === expectedHash
}
```

#### 4.2. Adicionar WEBHOOK_SECRET às variáveis de ambiente

Em `backend/.env.local`:
```
MERCADO_PAGO_WEBHOOK_SECRET=sua_chave_aqui
```

Em `backend/src/config/env.ts`, adicionar:
```typescript
mercadoPagoWebhookSecret: env('MERCADO_PAGO_WEBHOOK_SECRET'),
```

#### 4.3. Aplicar no handler

```typescript
// No handler de /api/checkout/webhook/mercado-pago:
const rawBody = await readRawBody(req) // precisa capturar body raw antes de parsear
const webhookSecret = config.mercadoPagoWebhookSecret

if (webhookSecret) {
  const isValid = verifyMercadoPagoSignature(
    rawBody,
    String(req.headers['x-signature'] ?? ''),
    String(req.headers['x-request-id'] ?? ''),
    webhookSecret,
  )
  if (!isValid) {
    writeJson(res, 403, { ok: false, error: 'Assinatura inválida.' }, corsOrigin)
    return
  }
}
```

### Configuração no Mercado Pago

1. Acessar painel do Mercado Pago → Configurações → Webhooks
2. Copiar o "Secret" do webhook
3. Colocar em `MERCADO_PAGO_WEBHOOK_SECRET` no `.env.local`

### Como testar

1. Testar com payload válido do Mercado Pago → 200
2. Testar com payload alterado → 403
3. Testar em sandbox do Mercado Pago antes de ir para prod

---

## 5. Adicionar rate-limiting na recuperação de senha

**Arquivo:** `backend/src/routes/passwordRecoveryRoutes.ts`
**Linhas:** 199 (request), 311 (verify)
**Risco atual:** Brute-force de código de 6 dígitos (viável em minutos)
**Impacto:** Usuários legítimos podem ser bloqueados temporariamente

### O que fazer

#### 5.1. Criar utilitário de rate-limiting

Criar `backend/src/utils/rateLimit.ts`:

```typescript
type RateLimitEntry = {
  count: number
  resetAt: number
}

const store = new Map<string, RateLimitEntry>()

/**
 * Verifica e incrementa contador de tentativas.
 * Retorna true se dentro do limite, false se excedido.
 */
export function checkRateLimit(
  key: string,
  maxAttempts: number = 5,
  windowMs: number = 60_000, // 1 minuto
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now()
  const entry = store.get(key)

  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs })
    return { allowed: true, remaining: maxAttempts - 1, resetAt: now + windowMs }
  }

  if (entry.count >= maxAttempts) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt }
  }

  entry.count++
  return { allowed: true, remaining: maxAttempts - entry.count, resetAt: entry.resetAt }
}

/**
 * Limpa entradas antigas periodicamente.
 */
export function cleanupRateLimit(maxAge: number = 300_000) {
  const now = Date.now()
  for (const [key, entry] of store.entries()) {
    if (now > entry.resetAt + maxAge) {
      store.delete(key)
    }
  }
}

// Limpar a cada 5 minutos
setInterval(() => cleanupRateLimit(), 300_000)
```

#### 5.2. Aplicar nos endpoints

```typescript
import { checkRateLimit } from '../utils/rateLimit.js'

// No handler de /api/auth/password-recovery/request:
const ip = getRequestSource(req) ?? 'unknown'
const rateKey = `recovery-request:${ip}:${email}`
const rate = checkRateLimit(rateKey, 5, 60_000) // 5 por minuto

if (!rate.allowed) {
  writeJson(res, 429, {
    ok: false,
    error: 'Muitas tentativas. Aguarde 1 minuto.',
    retryAfter: Math.ceil((rate.resetAt - Date.now()) / 1000),
  }, corsOrigin)
  return true
}

// No handler de /api/auth/password-recovery/verify:
const rateKeyVerify = `recovery-verify:${ip}:${email}`
const rateVerify = checkRateLimit(rateKeyVerify, 5, 60_000)

if (!rateVerify.allowed) {
  writeJson(res, 429, {
    ok: false,
    error: 'Muitas tentativas. Aguarde 1 minuto.',
    retryAfter: Math.ceil((rateVerify.resetAt - Date.now()) / 1000),
  }, corsOrigin)
  return true
}
```

### Como testar

1. Enviar 5 requests de recuperação → 6ª deve retornar 429
2. Aguardar 1 minuto → pode enviar novamente
3. Não há persistência em disco (reinício limpa contadores) — aceitável para esta necessidade

---

## 6. Melhorar política de senhas

**Arquivo:** `backend/src/routes/adminUsersRoutes.ts`
**Linhas:** 8, 147, 191, 238
**Risco atual:** Senhas fracas podem ser definidas
**Impacto:** Clerk pode rejeitar senhas muito curtas

### O que fazer

#### 6.1. Melhorar senha temporária

```typescript
// Substituir buildTemporaryStrongPassword():
function buildTemporaryStrongPassword() {
  // 16 caracteres, maiúscula, minúscula, número, símbolo
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%&*'
  let password = 'Aa1!' // garantir complexidade mínima
  for (let i = 0; i < 12; i++) {
    const idx = Math.floor(Math.random() * chars.length)
    password += chars[idx]
  }
  return password
}
```

#### 6.2. Remover skipPasswordChecks

Em `adminUsersRoutes.ts` e `passwordRecoveryRoutes.ts`, remover `skipPasswordChecks: true`:

```typescript
// ANTES:
await clerkClient.users.updateUser(clerkUser.id, {
  password: senha,
  skipPasswordChecks: true,    // ← REMOVER
  signOutOfOtherSessions: true,
})

// DEPOIS:
await clerkClient.users.updateUser(clerkUser.id, {
  password: senha,
  signOutOfOtherSessions: true,
})
```

> **NOTA:** O Clerk valida a senha por padrão (mínimo 8 caracteres, etc.).
> Se o sistema atual permite senhas fracas, primeiro validar com o time de produto.

### Como testar

1. Criar usuário com senha fraca (ex: "123") → deve ser rejeitado pelo Clerk
2. Criar usuário com senha forte → deve funcionar
3. Recuperar senha → código chega e senha é definida com sucesso

---

## 7. Tornar CORS mais restritivo

**Arquivo:** `backend/src/utils/http.ts`, `backend/src/server.ts`
**Risco atual:** CORS aceita qualquer origin se `CORS_ORIGIN=*`
**Impacto:** Frontend pode perder acesso se CORS ficar muito restritivo

### O que fazer

#### 7.1. Validar origem no request

```typescript
// Em backend/src/server.ts, logo no início do handler:
const allowedOrigins = config.corsOrigin
  .split(',')
  .map(o => o.trim())
  .filter(Boolean)

const requestOrigin = req.headers.origin ?? ''

if (req.method === 'OPTIONS' || req.method !== 'OPTIONS') {
  if (requestOrigin && !allowedOrigins.includes(requestOrigin)) {
    writeJson(res, 403, { ok: false, error: 'Origem não autorizada.' }, '')
    return
  }
}
```

#### 7.2. Configurar CORS correto

Em `backend/.env.local`:
```
CORS_ORIGIN=https://crm.certiid.mantovan.com.br,https://certiid.mantovan.com.br
```

**NÃO usar `*`** — listar apenas domínios conhecidos.

### Como testar

1. Acessar do domínio correto → funciona
2. Acessar de domínio diferente → retorna 403
3. Requests sem `Origin` (ex: Postman, backend-to-backend) → devem funcionar

---

## 8. Ocultar detalhes de erro em 500

**Arquivo:** `backend/src/server.ts`
**Linha:** 249
**Risco atual:** Mensagens de erro interno expostas ao cliente
**Impacto:** Zero funcional

### O que fazer

```typescript
// ANTES (linha 249):
writeJson(res, 500, { ok: false, error: message }, config.corsOrigin)

// DEPOIS:
console.error(`[HTTP ${req.method ?? 'UNKNOWN'} ${req.url ?? '/'}]`, error) // logar internamente
writeJson(res, 500, { ok: false, error: 'Erro interno do servidor.' }, config.corsOrigin)
```

### Como testar

1. Forçar um erro (ex: query SQL inválida) → resposta deve ser "Erro interno do servidor."
2. Log no servidor deve conter o detalhe completo

---

## 9. Autenticar endpoints de WhatsApp e Evolution

**Arquivos:**
- `backend/src/routes/whatsappSendRoutes.ts:806` (`/api/whatsapp/send`)
- `backend/src/routes/evolutionWebhookRoutes.ts:494-506` (`/api/evolution/connection/test`, `/api/evolution/webhook/configure`)
- `backend/src/routes/whatsappSendRoutes.ts:698-710` (mesmos endpoints duplicados)

**Risco atual:** Envio de mensagens e configuração de webhooks sem autenticação
**Impacto:** Chat ao vivo para de enviar se frontend não mandar token

### O que fazer

Aplicar `requireAuth` (do item 2) nestas rotas:

```typescript
// Em whatsappSendRoutes.ts, logo no início do handler:
if (method === 'POST' && url === '/api/whatsapp/send') {
  const authReq = await requireAuth(req, res, clerkSecretKey, corsOrigin)
  if (!authReq) return true
  // ... usar authReq em vez de req
}

// Mesmo padrão para:
// /api/evolution/connection/test
// /api/evolution/webhook/configure
```

### Como testar

1. `curl -X POST http://localhost:8787/api/whatsapp/send` → 401
2. `curl -H "Authorization: Bearer TOKEN_VALIDO" -X POST ...` → funciona
3. Chat ao vivo no frontend → mensagens enviam normalmente

---

## 10. Corrigir token de sessão do Portal

**Arquivo:** `backend/src/routes/portalRoutes.ts`
**Linhas:** 57-76
**Risco atual:** Token não pode ser revogado; timing comparison insegura
**Impacto:** Usuários logados no portal precisam logar de novo

### O que fazer

#### 10.1. Usar timing-safe comparison

```typescript
import { timingSafeEqual } from 'node:crypto'

function verifyPortalSession(token: string, secret: string): PortalSessionPayload | null {
  const [body, signature] = token.split('.')
  if (!body || !signature) return null

  const expected = createHmac('sha256', secret).update(body).digest('base64url')

  // Comparação constante no tempo (protege contra timing attack)
  if (expected.length !== signature.length) return null
  const sigBuffer = Buffer.from(signature)
  const expectedBuffer = Buffer.from(expected)
  if (!timingSafeEqual(sigBuffer, expectedBuffer)) return null

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as PortalSessionPayload
    if (!payload?.email || !payload.exp) return null
    if (Date.now() > payload.exp) return null
    return payload
  } catch {
    return null
  }
}
```

#### 10.2. Opcional: adicionar invalidação server-side

Se necessário no futuro, criar tabela `portal_revoked_tokens` e verificar antes de aceitar.

### Como testar

1. Login no portal → funciona
2. Token adulterado → rejeitado
3. Token expirado → rejeitado

---

## Checklist Final

```
□ .env.production removido do histórico Git
□ backend/src/utils/authMiddleware.ts criado
□ requireAuth aplicado em rotas admin
□ requireAdmin aplicado em /api/admin/*
□ Frontend envia Bearer token em todas as chamadas
□ Webhooks de pagamento validam assinatura
□ Rate-limiting implementado nos endpoints de recuperação
□ Senhas temporárias mais fortes
□ skipPasswordChecks removido
□ CORS configurado com domínios específicos
□ Erros 500 ocultam detalhes internos
□ Endpoints WhatsApp/Evolution autenticados
□ Token do Portal usa timing-safe comparison
□ npm run lint → sem erros
□ npm run build → sem erros
□ npm run build:backend → sem erros
□ Testes manuais realizados em todas as telas
```

---

## Contato

Em caso de dúvidas sobre alguma correção, referencie o arquivo e linha específica
mencionada neste documento.
