# 26 - Checkout Aiven com agenda e clientes

## Data
- 2026-06-19

## Status
- Checkout Aiven responde com produtos, pagamentos e slots de agenda.
- Submit com agendamento foi validado e criou `agendamentos_validacao`.
- Base `cadastros_base` do backup foi importada para Aiven.
- Rota publica do checkout foi desacoplada do Clerk/AuthProvider.

## Mudancas no frontend
- `src/main.tsx`
  - removeu `ClerkProvider` global.
  - agora renderiza apenas `<App />`.
- `src/App.tsx`
  - rotas publicas `/shop`, `/loja/:slug` e `/contestacao/:token` renderizam antes do fluxo privado.
  - Clerk/AuthProvider ficam restritos ao painel administrativo.
  - se faltar `VITE_CLERK_PUBLISHABLE_KEY`, apenas o painel privado mostra aviso de configuracao pendente.
- `.env.local`
  - criado localmente com:
    - `VITE_API_BASE_URL=http://localhost:8787/api`
    - `VITE_USE_LEGACY_SUPABASE=false`

## Mudancas no backend/sql
- `backend/sql/seedAgendaFromBackup.mjs`
  - cria agente/ponto operacional com IDs encontrados no backup.
  - vincula o agente a tabela ativa atual do Aiven.
  - importa as 5 disponibilidades semanais preservadas no backup.
- `backend/sql/seedCustomersFromBackup.mjs`
  - importa `cadastros_base.rows.json` para Aiven.

## Resultado da agenda
Endpoint:
- `POST http://localhost:8787/api/checkout/context`

Resultado validado:
- loja: `AVMD Certificacao Digital`
- produtos: 58
- pagamentos: 3
- agentes: 1
- pontos: 1
- slots: 20

## Resultado do submit com agendamento
Endpoint:
- `POST http://localhost:8787/api/checkout/submit`

Resultado:
- venda criada com sucesso
- agendamento criado com sucesso

Contagens transacionais apos testes:
- `cadastros_base`: 2688
- `titulares_certificado`: 2
- `vendas_certificados`: 2
- `agendamentos_validacao`: 1

## Validacoes executadas
- `npm run build:backend`
- `npm run build`
- `lookup_customer` validado via API com cadastro teste, sem expor dado real de cliente.

## Observacoes importantes
- `backend/.env.local` e `.env.local` sao arquivos locais e nao devem ser versionados.
- API Token do Aiven nao foi gravado em arquivo.
- O agente e ponto criados sao operacionais para habilitar agenda; os nomes reais devem ser revisados no cadastro administrativo depois.
- Para SSL mais estrito em producao, baixar o CA certificate do Aiven e configurar o `pg` com CA em vez de `rejectUnauthorized: false`.

## Proximos passos
1. Revisar nomes reais do agente e ponto no Aiven.
2. Cadastrar mais pontos/agentes/disponibilidades reais.
3. Remover ou marcar vendas teste antes de producao, se necessario.
4. Preparar deploy do backend e variaveis de ambiente do ambiente final.
