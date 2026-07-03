# Formatação de Mensagens Estruturadas de E-mail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mensagens estruturadas de agendamento vindas por e-mail (ex.: "Detalhes do Agendamento... Cliente: ... CPF/CNPJ: ...") aparecem no Chat Inbox CRM com cada campo em sua própria linha e com acentuação correta, tanto no balão central quanto no painel lateral direito e na prévia da lista de conversas.

**Architecture:** Um novo módulo puro (`src/lib/messageFormatting.ts`) decodifica entidades HTML e reconstrói quebras de linha a partir de rótulos de campo reconhecidos, sem depender de nenhuma mudança no backend ou nos sistemas externos que produzem o texto original. `src/pages/ChatInboxCRM.tsx` passa a chamar essa função nos três pontos onde o conteúdo é exibido, e ganha um ajuste de CSS (`whitespace-pre-line`) no painel que hoje não preserva nenhuma quebra de linha.

**Tech Stack:** React + TypeScript (Vite), sem dependências novas. Verificação sem suite de testes automatizada (nenhuma configurada no projeto) — via script Node ad-hoc com `--experimental-strip-types` e via `npm run build`/`npm run lint`.

**Spec de referência:** `docs/superpowers/specs/2026-07-03-email-message-formatting-design.md`

---

## Notas gerais

- Este projeto não tem suite de testes configurada (`CLAUDE.md`). A validação de cada tarefa é `npm run lint`, `npm run build`, e para a função pura, um script Node ad-hoc descartável.
- Existem mudanças não commitadas na `main` feitas fora deste plano (`scripts/apply-sql-file.mjs`, duas migrações SQL, `docs/processo-emissao-protocolo-gestaoar.md`) — não tocar nelas, não são parte deste trabalho.
- Ao final de cada tarefa, comitar. Push e deploy só ao final de todo o plano ou quando o usuário pedir.

---

### Task 1: Criar o módulo `messageFormatting.ts`

**Files:**
- Create: `src/lib/messageFormatting.ts`

- [ ] **Step 1: Escrever o módulo**

```ts
const HTML_ENTITY_MAP: Record<string, string> = {
  aacute: 'á', Aacute: 'Á', agrave: 'à', Agrave: 'À', acirc: 'â', Acirc: 'Â', atilde: 'ã', Atilde: 'Ã',
  eacute: 'é', Eacute: 'É', egrave: 'è', Egrave: 'È', ecirc: 'ê', Ecirc: 'Ê',
  iacute: 'í', Iacute: 'Í', igrave: 'ì', Igrave: 'Ì', icirc: 'î', Icirc: 'Î',
  oacute: 'ó', Oacute: 'Ó', ograve: 'ò', Ograve: 'Ò', ocirc: 'ô', Ocirc: 'Ô', otilde: 'õ', Otilde: 'Õ',
  uacute: 'ú', Uacute: 'Ú', ugrave: 'ù', Ugrave: 'Ù', ucirc: 'û', Ucirc: 'Û', uuml: 'ü', Uuml: 'Ü',
  ccedil: 'ç', Ccedil: 'Ç',
  nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
}

function decodeHtmlEntities(text: string): string {
  return text.replace(/&(#(\d+)|#x([0-9a-fA-F]+)|([a-zA-Z]+));/g, (match, _group, dec, hex, named) => {
    if (dec) return String.fromCharCode(Number(dec))
    if (hex) return String.fromCharCode(parseInt(hex, 16))
    return HTML_ENTITY_MAP[named as string] ?? match
  })
}

const CAMPOS_COM_ROTULO = [
  'CPF/CNPJ',
  'Telefone Celular',
  'Telefone',
  'Email',
  'Cliente',
  'Pedido',
  'Código',
  'Produto',
  'Posto',
  'Data',
  'Hora',
]

const ROTULOS_CHAVE = ['Cliente:', 'CPF/CNPJ:', 'Telefone:', 'Email:', 'Pedido:', 'Produto:']

function pareceMensagemEstruturada(text: string): boolean {
  return ROTULOS_CHAVE.filter(rotulo => text.includes(rotulo)).length >= 3
}

function reconstruirQuebrasDeLinha(text: string): string {
  let result = text.replace(/([^\n])\s*(Detalhes do Agendamento)/g, '$1\n$2')
  for (const campo of CAMPOS_COM_ROTULO) {
    const marcador = `${campo}:`
    const escaped = marcador.replace(/[/]/g, '\\/')
    const pattern = new RegExp(`([^\\n])\\s*${escaped}`, 'g')
    result = result.replace(pattern, `$1\n${marcador}`)
  }
  return result
}

export function normalizeStructuredMessage(raw: string | null | undefined): string {
  const text = String(raw ?? '')
  if (!text) return text
  const decoded = decodeHtmlEntities(text)
  if (!pareceMensagemEstruturada(decoded)) return decoded
  const reconstructed = reconstruirQuebrasDeLinha(decoded)
  return reconstructed.split('\n').map(line => line.trim()).join('\n')
}
```

- [ ] **Step 2: Verificar com um script Node descartável**

Criar um arquivo temporário `scripts/_verify-message-formatting.mjs` (será apagado no Step 4, não é para ficar no repositório):

```js
import { normalizeStructuredMessage } from '../src/lib/messageFormatting.ts'

const estruturada = "O cliente LABELIUM BRASIL PUBLICIDADE E PROPAGANDA LTDA. agendou a visita do pedido c&oacute;digo 26521907 para o dia 06/07/2026 &agrave;s 11:00h. Detalhes do Agendamento -------------------Cliente: LABELIUM BRASIL PUBLICIDADE E PROPAGANDA LTDA. CPF/CNPJ: 17751909000184 Telefone: (81)9996-19191 Telefone Celular: (00) 0000-0000 Email: felipe.freyre@crpartners.com.br Pedido: 26521907 Código: SRFA1PJHV2 Produto: e-CNPJ (CERTISIGN - RFB) A1 COMPUTADOR 1 ANO Posto: AR Certifast - videoconferencia Data: 06/07/2026 Hora: 11:00"

const resultado = normalizeStructuredMessage(estruturada)
const linhas = resultado.split('\n')

const checks = {
  entidades_decodificadas: resultado.includes('código') && resultado.includes('às') && !resultado.includes('&oacute;') && !resultado.includes('&agrave;'),
  campos_em_linhas_separadas: linhas.some(l => l.trim() === 'Cliente: LABELIUM BRASIL PUBLICIDADE E PROPAGANDA LTDA.')
    && linhas.some(l => l.trim().startsWith('CPF/CNPJ:'))
    && linhas.some(l => l.trim().startsWith('Telefone:'))
    && linhas.some(l => l.trim().startsWith('Telefone Celular:'))
    && linhas.some(l => l.trim().startsWith('Hora:')),
  mensagem_comum_inalterada: normalizeStructuredMessage('Bom dia! Meu pedido chegou, obrigado.') === 'Bom dia! Meu pedido chegou, obrigado.',
  nulo_retorna_vazio: normalizeStructuredMessage(null) === '',
  vazio_retorna_vazio: normalizeStructuredMessage('') === '',
}

console.log(JSON.stringify({ resultado, checks }, null, 2))
const todasPassaram = Object.values(checks).every(Boolean)
process.exitCode = todasPassaram ? 0 : 1
```

Run: `node --experimental-strip-types scripts/_verify-message-formatting.mjs; echo "exit: $?"`

Expected: JSON com todos os campos de `checks` como `true`, e `exit: 0`. (O aviso `ExperimentalWarning: Type Stripping...` no stderr é esperado e não é erro.)

- [ ] **Step 3: Corrigir se algum check falhar**

Se algum `check` vier `false`, ajustar `src/lib/messageFormatting.ts` e rodar o Step 2 de novo até todos passarem.

- [ ] **Step 4: Apagar o script de verificação**

```bash
rm scripts/_verify-message-formatting.mjs
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/messageFormatting.ts
git commit -m "feat: adiciona normalizacao de mensagens estruturadas de email"
```

---

### Task 2: Aplicar a normalização nos três pontos de exibição do Chat Inbox CRM

**Files:**
- Modify: `src/pages/ChatInboxCRM.tsx:33` (import)
- Modify: `src/pages/ChatInboxCRM.tsx:414-416` (balão central)
- Modify: `src/pages/ChatInboxCRM.tsx:2702-2707` (painel lateral)
- Modify: `src/pages/ChatInboxCRM.tsx:3084` (prévia da lista)

- [ ] **Step 1: Adicionar o import**

Localizar, no topo do arquivo:

```ts
import { applyOutgoingSignature, DEFAULT_CRM_CHAT_SETTINGS, loadCrmChatSettings } from '@/lib/crmChatSettings'
```

Adicionar logo abaixo:

```ts
import { applyOutgoingSignature, DEFAULT_CRM_CHAT_SETTINGS, loadCrmChatSettings } from '@/lib/crmChatSettings'
import { normalizeStructuredMessage } from '@/lib/messageFormatting'
```

- [ ] **Step 2: Aplicar no balão central (`parseEvolutionEventMessages`)**

Localizar dentro da função `parseEvolutionEventMessages`:

```ts
      const content = (payload.content as string | undefined)
        ?? (data?.content as string | undefined)
        ?? null
```

Substituir por:

```ts
      const rawContent = (payload.content as string | undefined)
        ?? (data?.content as string | undefined)
        ?? null
      const content = rawContent ? normalizeStructuredMessage(rawContent) : rawContent
```

- [ ] **Step 3: Aplicar no painel "Leitura operacional" e corrigir o CSS**

Localizar:

```tsx
                    <PanelBlock title="Leitura operacional">
                      <ul className="space-y-2 text-sm text-slate-600">
                        <li>Fila: <strong>{queueLabel(selectedConversation.fila)}</strong></li>
                        <li>Modo atual: <strong>{humanModeActive ? 'Humano' : 'IA Clara'}</strong></li>
                        <li>Documento-chave: <strong>{selectedConversation.document_key}</strong></li>
                        <li>Agente desde: <strong>{formatDateTime(selectedConversation.agente_desde)}</strong></li>
                        <li>Ultima mensagem: <strong>{selectedConversation.ultima_mensagem || 'Sem resumo'}</strong></li>
                      </ul>
                    </PanelBlock>
```

Substituir por:

```tsx
                    <PanelBlock title="Leitura operacional">
                      <ul className="space-y-2 whitespace-pre-line text-sm text-slate-600">
                        <li>Fila: <strong>{queueLabel(selectedConversation.fila)}</strong></li>
                        <li>Modo atual: <strong>{humanModeActive ? 'Humano' : 'IA Clara'}</strong></li>
                        <li>Documento-chave: <strong>{selectedConversation.document_key}</strong></li>
                        <li>Agente desde: <strong>{formatDateTime(selectedConversation.agente_desde)}</strong></li>
                        <li>Ultima mensagem: <strong>{normalizeStructuredMessage(selectedConversation.ultima_mensagem) || 'Sem resumo'}</strong></li>
                      </ul>
                    </PanelBlock>
```

- [ ] **Step 4: Aplicar na prévia da lista de conversas**

Localizar:

```tsx
          <p className={`mt-2 line-clamp-2 text-xs ${selected ? 'text-slate-100' : 'text-slate-600'}`}>{item.ultima_mensagem || 'Sem mensagem'}</p>
```

Substituir por:

```tsx
          <p className={`mt-2 line-clamp-2 text-xs ${selected ? 'text-slate-100' : 'text-slate-600'}`}>{normalizeStructuredMessage(item.ultima_mensagem) || 'Sem mensagem'}</p>
```

- [ ] **Step 5: Rodar build e lint**

Run: `npm run build`
Expected: build finaliza sem erros.

Run: `npx eslint src/pages/ChatInboxCRM.tsx`
Expected: comparar a contagem de erros/warnings com a mesma checagem rodada antes da Task 1 (baseline) — a mudança não deve introduzir nenhum erro novo relacionado às linhas alteradas. Se a contagem total mudar, confirmar que os novos itens (se houver) não estão nas regiões editadas (import, `parseEvolutionEventMessages`, painel "Leitura operacional", prévia da lista).

- [ ] **Step 6: Commit**

```bash
git add src/pages/ChatInboxCRM.tsx
git commit -m "feat: usa normalizacao de mensagens estruturadas no chat inbox crm"
```

---

### Task 3: Verificação manual no navegador

**Files:** nenhum (verificação, sem código)

- [ ] **Step 1: Subir o backend e o frontend localmente**

Run: `npm run build:backend && npm run start:backend` (em um terminal)
Run: `npm run dev` (em outro terminal)

- [ ] **Step 2: Abrir a conversa que apareceu no print original**

No navegador, ir em Chat ao Vivo (Chat Inbox CRM), localizar uma conversa da fila "Agendamento" com uma mensagem de confirmação por e-mail (ex.: a conversa "LABELIUM BRASIL PUBLICIDADE E PROPAGANDA LTDA." do print, se ainda existir, ou qualquer outra do mesmo padrão).

Expected: o balão de mensagem central mostra cada campo (`Cliente:`, `CPF/CNPJ:`, `Telefone:`, `Telefone Celular:`, `Email:`, `Pedido:`, `Código:`, `Produto:`, `Posto:`, `Data:`, `Hora:`) em sua própria linha, com acentuação correta (sem `&oacute;`, `&agrave;` etc. visíveis).

- [ ] **Step 3: Conferir o painel lateral direito**

Com a mesma conversa selecionada, olhar o bloco "Leitura operacional" → "Ultima mensagem".

Expected: mesmo texto formatado em linhas separadas, não aglutinado.

- [ ] **Step 4: Conferir a lista de conversas à esquerda**

Expected: a prévia (2 linhas, truncada) da conversa mostra texto com acentuação correta, sem entidades cruas visíveis.

- [ ] **Step 5: Conferir que uma conversa de WhatsApp comum não foi afetada**

Abrir qualquer conversa comum de WhatsApp (fila "Atendimento", sem o padrão de campos estruturados).

Expected: mensagens aparecem exatamente como antes, sem quebras de linha novas inseridas indevidamente.
