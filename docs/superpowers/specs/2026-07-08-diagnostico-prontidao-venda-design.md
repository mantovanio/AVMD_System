# Diagnóstico de Prontidão de Venda

## Contexto

O wizard de Nova Venda (`Comercial.tsx`, passo 6 "Tabela e produto") filtra as tabelas de preço disponíveis por 5 critérios encadeados, documentados em `docs/guia-configuracao-nova-venda.md`: tabela ativa, produto ativo, vínculo agente+ponto (só para `agente_registro`), participantes (parceiro/tipo de parceiro/perfil) e tipo de emissão. Quando o resultado é zero, o usuário não tem hoje nenhuma pista de qual filtro travou — precisa seguir manualmente o checklist do guia ou pedir suporte técnico.

Um bug real corrigido em 2026-07-06 (commit `c50ca8d`) mostrou como esses filtros podem divergir silenciosamente entre a lógica real do wizard e qualquer lógica de diagnóstico escrita separadamente.

## Objetivo

Dar visibilidade imediata sobre por que uma tabela não aparece no wizard, com duas superfícies:
1. Um banner reativo no próprio passo 6, quando o resultado é vazio.
2. Uma tela simuladora ("Prontidão de Venda") para explorar cenários hipotéticos sem precisar estar no meio de uma venda real.

## Fonte única de verdade

Extrair a lógica hoje embutida em `tabelasDisponiveisVenda` ([Comercial.tsx:786-843](../../../src/pages/Comercial.tsx#L786-L843)) para uma função pura:

```ts
type EtapaResultado = 'ok' | 'bloqueou' | 'nao_aplicavel'

interface DiagnosticoTabela {
  tabelaId: string
  nome: string
  ativa: EtapaResultado
  produtoAtivo: EtapaResultado
  agentePonto: EtapaResultado       // 'nao_aplicavel' fora do perfil agente_registro
  participante: EtapaResultado
  tipoEmissao: EtapaResultado
  resultado: 'aparece' | 'bloqueada'
  motivoBloqueio?: string           // texto pronto pra exibição, só quando bloqueada
}

function avaliarProntidaoTabela(
  tabelas: TabelaPreco[],
  itens: TabelaPrecoItem[],
  participantes: TabelaPrecoParticipante[],
  agentesTabelaPreco: AgenteTabelaPreco[],
  contexto: {
    perfil: Perfil
    agenteId?: string          // obrigatório só quando perfil === 'agente_registro'
    pontoAtendimentoId: string
    parceiroId?: string | null
    tipoParceiro?: TipoParceiro | null
    tipoEmissao?: TipoEmissao | null
  }
): DiagnosticoTabela[]
```

As 5 etapas rodam na mesma ordem e com a mesma regra descrita no guia (seção "O que decide se uma tabela aparece no passo 6"). `tabelasDisponiveisVenda` passa a ser:

```ts
avaliarProntidaoTabela(...).filter(r => r.resultado === 'aparece')
```

Isso garante que banner e simulador nunca divirjam do comportamento real do wizard — qualquer correção futura de regra é feita em um lugar só.

## Banner no wizard (passo 6)

**Quando aparece:** lista de tabelas disponíveis fica vazia **e** existe pelo menos uma tabela cadastrada no sistema (se não há nenhuma tabela cadastrada, é um problema de configuração inicial fora de escopo desta feature — sem banner).

**Quem vê:** todos os perfis.

**Conteúdo:**
- Mensagem curta com a causa mais provável:
  - Se todas as tabelas bloqueadas travaram na mesma etapa, nomear essa etapa e o motivo específico (ex.: "nenhuma tabela libera o parceiro selecionado").
  - Se os motivos forem heterogêneos entre tabelas, mostrar "motivos variados" e direcionar para o detalhamento.
- `<details>` expansível com o funil agregado: quantas tabelas cadastradas → quantas ativas → quantas com produto ativo → quantas passam agente/ponto → quantas passam participante → quantas passam tipo de emissão.
- Botão "Ver diagnóstico completo" que navega para a aba "Prontidão de Venda" (ver abaixo), pré-preenchendo o formulário com o cenário atual do wizard (ponto, parceiro, tipo de emissão, perfil/agente do usuário logado).

## Tela "Prontidão de Venda"

**Localização:** nova aba dentro de Comercial, ao lado de Tabelas de Preço, Pontos de Atendimento, Parceiros e Certificados.

**Formulário simulador:**
- Ponto de Atendimento (select, obrigatório)
- Parceiro Vendedor (select, com opção explícita "Seguir sem parceiro vendedor")
- Tipo de Emissão (select, opcional)
- Perfil hipotético (select: `admin`, `vendedor`, `agente_registro`, `usuario`)
- Agente (select, só visível/obrigatório quando perfil hipotético = `agente_registro`, já que a checagem de agente+ponto é por agente específico, não por perfil genérico)

Recalcula a cada mudança de campo, client-side, sem chamada de rede (reaproveita os dados de catálogo já carregados em `Comercial.tsx` — tabelas, itens, participantes, agentes).

**Resultado:** lista de cards, um por tabela cadastrada (inclusive inativas), cada um com:
- Nome da tabela + selo final: ✅ Aparece / ❌ Bloqueada.
- `<details>` "Ver motivo": qual das 5 etapas travou e o texto do motivo. Tabelas inativas mostram só "Tabela desativada", sem rodar as demais checagens (evita ruído de etapas irrelevantes).

## Casos de borda

- Perfil `agente_registro` no simulador exige selecionar o agente específico (não só o perfil), pois a regra real de vínculo é por agente, não por perfil.
- Sistema sem nenhuma tabela cadastrada: nem banner nem tela mostram diagnóstico de bloqueio — é tratado como estado inicial, não coberto por esta feature.
- Tabela sem nenhum participante cadastrado: etapa de participante é sempre `ok` (regra já existente — sem participantes, filtro fica aberto a qualquer parceiro).

## Validação

Este projeto não tem suite de testes automatizados configurada (ver `CLAUDE.md`). Validação será manual, reproduzindo os casos reais já documentados em `docs/guia-configuracao-nova-venda.md`:
- Tabela "Matriz" com participantes `Perfil: agente_registro` e `Perfil: vendedor` (sem `admin`) — simulador deve mostrar "Bloqueada" pra perfil `admin` com motivo de participante.
- Tabelas "Full" e "SJC" bloqueadas por parceiro incompatível — simulador deve mostrar o motivo de participante específico, não confundir com o filtro de perfil.
- Cenário real que gerou este bug (4 tabelas cadastradas, 1 aparecendo) — banner deve identificar corretamente que o motivo é heterogêneo entre as tabelas bloqueadas.
