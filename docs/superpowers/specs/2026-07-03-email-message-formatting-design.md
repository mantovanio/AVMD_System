# Formatação de mensagens estruturadas de e-mail no Chat Inbox CRM — Design

Data: 2026-07-03
Módulo: `src/pages/ChatInboxCRM.tsx` (novo módulo `src/lib/messageFormatting.ts`)

## Contexto

O Chat Inbox CRM (`src/pages/ChatInboxCRM.tsx`) exibe mensagens de várias origens (WhatsApp via Evolution API, Chatwoot) numa mesma linha do tempo. Mensagens originadas de e-mails de agendamento (ex.: confirmações da Certifast) chegam via `communication_events` (`source = 'chatwoot'`), lidas pela rota `GET /api/chat/crm/messages` e transformadas no frontend por `parseEvolutionEventMessages`, que usa `payload.content` como está, sem nenhuma transformação.

Um print de tela mostrou esse conteúdo aglutinado — sem quebra de linha entre campos como "Cliente:", "CPF/CNPJ:", "Telefone:" — e com entidades HTML não decodificadas (ex.: `c&oacute;digo` em vez de "código", `&agrave;s` em vez de "às"). A origem desse conteúdo (quem monta o `content` antes de gravar em `communication_events`) é externa ao código deste repositório — muito provavelmente um workflow n8n que processa o e-mail antes de publicar o evento — e não foi alterada por este design; a correção aqui é inteiramente do lado da exibição.

Também foi confirmado, por leitura de código, um bug isolado no painel lateral direito: a lista "Leitura operacional" (que mostra `Ultima mensagem: <resumo>`) não preserva quebras de linha porque o `<ul>` que a contém não tem nenhuma propriedade CSS de `white-space` — mesmo se o texto tivesse `\n`, ele apareceria colapsado.

## Objetivo

1. Corrigir o painel lateral direito para preservar quebras de linha existentes no resumo da última mensagem.
2. Tornar a exibição de mensagens estruturadas (do tipo "Detalhes do Agendamento") resiliente no frontend: decodificar entidades HTML comuns e reconstruir quebras de linha antes de cada campo reconhecido, sem depender de uma correção na origem externa do dado.
3. Não alterar mensagens de chat comuns (WhatsApp, texto livre) — a reconstrução de quebra de linha só deve agir em conteúdo reconhecidamente estruturado.

## Fora de escopo

- Qualquer alteração em workflows n8n ou em qualquer sistema externo que produza o conteúdo original.
- Qualquer alteração no backend (`backend/src/`) — a correção é inteiramente de exibição no frontend.
- Persistência do texto normalizado de volta no banco — a normalização acontece só na renderização, o dado bruto permanece como está no banco.

## Novo módulo: `src/lib/messageFormatting.ts`

Exporta uma única função pública:

```ts
export function normalizeStructuredMessage(raw: string | null | undefined): string
```

Comportamento:

1. **Decodificação de entidades HTML.** Decodifica entidades numéricas (`&#123;`, `&#x7B;`) e um conjunto de entidades nomeadas comuns em texto em português: vogais acentuadas (á, à, â, ã, é, è, ê, í, î, ó, ò, ô, õ, ú, û, ü — maiúsculas e minúsculas), `ç`/`Ç`, e as entidades estruturais `&nbsp;`, `&amp;`, `&lt;`, `&gt;`, `&quot;`, `&apos;`. Entidades não reconhecidas permanecem como estão (sem quebrar o texto).
2. **Reconstrução de quebras de linha**, condicionada a uma checagem de "isto parece uma mensagem estruturada": conta quantos dos rótulos reconhecidos (`Cliente:`, `CPF/CNPJ:`, `Telefone:`, `Email:`, `Pedido:`, `Produto:`) aparecem no texto decodificado. Se menos de 3 aparecerem, a função devolve o texto só com as entidades decodificadas, sem tocar em quebras de linha — evita reformatar mensagens de chat comuns que por acaso contenham uma dessas palavras.
   Se 3 ou mais aparecerem, insere `\n` antes de cada ocorrência dos rótulos: `Detalhes do Agendamento`, `CPF/CNPJ:`, `Telefone Celular:`, `Telefone:`, `Email:`, `Cliente:`, `Pedido:`, `Código:`, `Produto:`, `Posto:`, `Data:`, `Hora:` (sempre que precedidos de algum caractere que não seja já uma quebra de linha).

## Pontos de uso (todos em `src/pages/ChatInboxCRM.tsx`)

1. **Balão de mensagem central** — dentro de `parseEvolutionEventMessages` (~linha 414), aplicar `normalizeStructuredMessage` ao valor de `content` antes de retornar o objeto de mensagem. O balão já usa `whitespace-pre-wrap` ([ChatInboxCRM.tsx:3168](../../../src/pages/ChatInboxCRM.tsx#L3168)), então as quebras de linha reconstruídas já aparecerão corretamente sem mudança de CSS ali.
2. **Painel "Leitura operacional"** (~linha 2707) — aplicar `normalizeStructuredMessage` ao valor de `selectedConversation.ultima_mensagem`, e adicionar `whitespace-pre-line` ao `<ul>` que envolve o item (~linha 2702), já que hoje não preserva quebra de linha nenhuma.
3. **Prévia da conversa na lista à esquerda** (~linha 3084, `line-clamp-2`) — aplicar `normalizeStructuredMessage` ao valor de `item.ultima_mensagem` para consistência (decodifica entidades mesmo em texto truncado); `line-clamp-2` já lida com corte visual, não precisa de CSS de `white-space` adicional.

## Erros e casos de borda

- **Texto sem entidades nem rótulos reconhecidos** (mensagem de WhatsApp comum): `normalizeStructuredMessage` devolve o texto inalterado — o count de rótulos fica abaixo de 3 e não há entidades para decodificar.
- **Texto com poucas entidades mas não estruturado** (ex.: um cliente escreve "café" corretamente, sem entidade): nada a decodificar, função é no-op nesse aspecto.
- **`raw` nulo ou vazio**: retorna string vazia, sem lançar erro.
- **Entidade desconhecida** (fora do mapa): permanece literal no texto (`&alguma-coisa-rara;`), sem quebrar a renderização.

## Critérios de aceite

- O balão central de uma mensagem estruturada de agendamento mostra cada campo (`Cliente:`, `CPF/CNPJ:`, `Telefone:`, etc.) em sua própria linha, com acentuação correta (sem `&oacute;`, `&agrave;` etc. visíveis).
- O painel "Leitura operacional" mostra o mesmo resumo formatado da mesma forma.
- A prévia da conversa na lista à esquerda mostra o texto com acentuação correta (ainda truncado por `line-clamp-2`, mas sem entidades cruas).
- Uma mensagem de WhatsApp comum, sem o padrão de campos estruturados, continua sendo exibida exatamente como antes (sem quebras de linha novas inseridas indevidamente).
