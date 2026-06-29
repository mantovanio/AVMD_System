# Ponto de salvamento 34 - Frontend Clerk em producao

Data: 2026-06-29 08:50 -03:00

## Contexto

O projeto AVMD_System esta em migracao operacional para Aiven + Clerk.
Supabase nao deve mais ser a base principal, ficando apenas como legado temporario quando necessario.

O usuario esta tentando colocar o CRM em nuvem no dominio:

- `https://crm.certiid.mantovan.com.br`

Backend/API ja estava respondendo em producao:

- `https://api.certiid.mantovan.com.br/healthz`

## Situacao observada

- O navegador abriu `https://crm.certiid.mantovan.com.br`, mas mostrou tela branca.
- O Chrome tambem indicou pagina nao segura.
- Logs anteriores indicaram que o frontend estava sendo entregue pelo nginx/Traefik:
  - `GET /` retornou 200
  - assets JS/CSS retornaram 200
- Portanto, a tela branca provavelmente nao era erro de entrega de arquivo, mas erro de runtime no JavaScript.
- O certificado TLS ainda estava usando certificado padrao do Traefik em algum momento:
  - isso explica o aviso de seguranca.
  - provavel causa: DNS de `crm.certiid.mantovan.com.br` ainda estava propagando quando o Traefik tentou emitir ACME.

## Diagnostico tecnico

Arquivos relevantes:

- `src/lib/runtimeConfig.ts`
- `src/lib/supabase.ts`
- `.env.local`
- `.env`

O frontend exige:

- `VITE_CLERK_PUBLISHABLE_KEY`
- `VITE_API_BASE_URL`
- `VITE_USE_LEGACY_SUPABASE=false` para modo Aiven API

O arquivo `src/lib/supabase.ts` ja esta protegido para nao criar client Supabase quando `supabaseUrl` e `supabaseAnonKey` estiverem ausentes.
Isso reduz o risco da correcao: nao e necessario reescrever telas agora, apenas garantir env correto no build de producao.

## Credenciais e seguranca

O usuario forneceu a chave publica do Clerk para producao/teste.
A chave completa nao foi registrada neste ponto de salvamento para evitar espalhar credencial no repositorio.

Regra:

- nao commitar `.env`, `.env.local` ou `.env.production`.
- nao colocar secrets em handoffs, GitHub ou logs publicos.
- aplicar variaveis sensiveis apenas no ambiente da VPS quando necessario.

## Estado do workspace local

Antes deste salvamento, o `git status --short` indicava varias alteracoes pendentes nao feitas nesta etapa.
Nao reverter, nao limpar e nao incluir em commit sem revisao.

Alteracoes pendentes observadas:

- `backend/src/contracts/checkoutContract.ts`
- `backend/src/repositories/aivenCheckoutRepository.ts`
- `backend/src/repositories/checkoutRepository.ts`
- `backend/src/repositories/leadRepository.ts`
- `backend/src/routes/checkoutRoutes.ts`
- `backend/src/server.ts`
- `backend/src/services/checkoutService.ts`
- `src/lib/checkoutContract.ts`
- `src/lib/nfse.ts`
- `src/pages/ChatAoVivo.tsx`
- `src/pages/Comercial.tsx`
- `src/pages/Configuracoes.tsx`
- `src/pages/Financeiro.tsx`
- `src/pages/MarketplaceLoja.tsx`
- `.claude/`
- `backend/sql/009_chat_leads_columns.sql`
- `backend/src/routes/chatRoutes.ts`
- `backend/src/services/checkoutPaymentService.ts`
- `backend/src/testing/`

## Proximo passo seguro

Aplicar correcao minima na VPS:

1. Criar/atualizar `/opt/avmd/AVMD_System/.env.production` com variaveis Vite de producao.
2. Rebuildar somente o frontend.
3. Publicar novamente o conteudo de `dist/` em `/var/www/crm.certiid.mantovan.com.br/`.
4. Validar `/healthz`, pagina principal e assets.
5. Se o certificado continuar padrao do Traefik, primeiro consultar logs ACME/Traefik antes de qualquer alteracao global.

## Limites operacionais

Nao mexer agora em:

- banco Aiven;
- N8N;
- Evolution API;
- Chatwoot;
- SEFAZ/prefeituras;
- configuracao global do Traefik;
- Docker Swarm fora do servico do frontend.

A prioridade e destravar o carregamento do login com Clerk no frontend em nuvem.

## Correcao aplicada na VPS

Correcao minima aplicada em producao:

1. Confirmado que `/opt/avmd/AVMD_System/.env.production` tem as variaveis Vite esperadas.
2. Confirmado que `VITE_API_BASE_URL` aponta para `https://api.certiid.mantovan.com.br/api`.
3. Confirmado que `VITE_USE_LEGACY_SUPABASE=false`.
4. Confirmado que `VITE_CLERK_PUBLISHABLE_KEY` esta presente, sem imprimir o valor completo.
5. Gerado backup do frontend anterior em `/opt/backups/certiid/frontend/crm-certiid-20260629-085244.tar.gz`.
6. Executado `npm run build` na VPS com `nice -n 10`.
7. Publicado `dist/` em `/var/www/crm.certiid.mantovan.com.br/` com `rsync -a --delete`.
8. Validado `https://crm.certiid.mantovan.com.br` com HTTP 200.
9. Validado `https://crm.certiid.mantovan.com.br/login` com HTTP 200 pela VPS.
10. Validado `https://api.certiid.mantovan.com.br/healthz` com retorno saudavel pela VPS.

## Resultado da correcao

O certificado observado depois da publicacao ja nao era mais o certificado padrao do Traefik.
Foi observado certificado Let's Encrypt para:

- `crm.certiid.mantovan.com.br`

O frontend foi republicado com build nova contendo a URL publica da API.
A tela branca anterior deve ser revalidada no navegador com hard refresh ou aba anonima para evitar cache antigo.

Observacao: uma chamada local com `curl.exe` para a API falhou por tentativa de conexao via proxy local `127.0.0.1`; isso nao foi considerado falha de producao, pois a validacao feita dentro da VPS retornou saudavel.
