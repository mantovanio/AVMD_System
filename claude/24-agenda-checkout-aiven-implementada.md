# 24-agenda-checkout-aiven-implementada.md

## Data
- 2026-06-19

## O que avancou
- O backend do checkout agora calcula o contexto de agenda no lado do servidor.
- A implementacao reaproveita a mesma logica conceitual que ja existia no frontend legado.
- O fluxo passa a respeitar o encadeamento real das tabelas operacionais do projeto.

## Tabelas consideradas na agenda do checkout
- `agentes_tabelas_preco`
- `parceiros_agentes_permitidos`
- `agentes_disponibilidade`
- `agentes_indisponibilidades`
- `agendamentos_validacao`
- `profiles`
- `pontos_atendimento`

## Regra atual aplicada
- Primeiro o sistema localiza os agentes vinculados a `tabelas_preco`.
- Se a loja for de parceiro, o sistema cruza isso com `parceiros_agentes_permitidos`.
- Depois busca disponibilidades ativas, bloqueios ativos e agendamentos futuros.
- Em seguida gera os proximos slots livres e devolve o contexto pronto para a tela pública.

## Arquivos principais envolvidos
- `backend/src/utils/agenda.ts`
- `backend/src/repositories/checkoutRepository.ts`
- `backend/src/repositories/aivenCheckoutRepository.ts`
- `backend/src/services/checkoutService.ts`

## Resultado tecnico
- `getCheckoutScheduleContext()` deixou de retornar listas vazias fixas.
- O backend agora devolve:
  - `agentes`
  - `pontos`
  - `slots`
- A compilacao seguiu valida no backend e no frontend.

## Validacoes executadas
- `npm run build:backend`
- `npm run build`

## Pendencia principal agora
- Falta conectar a `DATABASE_URL` real do Aiven para testar leitura real do banco e subir o servidor com dados vivos.
