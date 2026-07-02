# Diretrizes do Repositorio

## Estrutura do Projeto
Este repositorio tem um frontend em `Vite + React + TypeScript` e um backend Node/TypeScript proprio, alem de automacoes em n8n. O codigo principal do frontend fica em `src/`:
- `src/components/` para componentes reutilizaveis, como `ChatPanel.tsx`
- `src/pages/` para telas de rota, como `LoginPage.tsx`
- `src/lib/` para auth, clientes e integracoes
- `src/contexts/` para estado compartilhado com React Context
- `src/assets/` para imagens e recursos estaticos

Arquivos publicos ficam em `public/`. Configuracoes principais ficam na raiz, como `vite.config.ts`, `eslint.config.js`, `tailwind.config.cjs` e `tsconfig*.json`.

Outras pastas relevantes:
- `backend/` codigo do backend (Node/TypeScript), com `backend/src/` (config, contracts, db, integrations, repositories, routes, services, utils) e `backend/sql/` para migracoes especificas do backend
- `n8n/` workflows exportados (JSON) e scripts de manutencao/migracao de automacoes (Clara, CRM, renovacoes etc.)
- `sql/` migracoes de banco do projeto principal
- `ops/` documentacao e scripts operacionais de VPS/deploy (nginx, systemd, scripts)
- `storage/` arquivos persistidos (ex.: `storage/attachments`)

## Comandos de Desenvolvimento
- `npm install`: instala dependencias
- `npm run dev`: sobe o servidor local do Vite (frontend)
- `npm run build`: valida TypeScript e gera o bundle de producao do frontend
- `npm run preview`: publica localmente a build gerada
- `npm run lint`: executa o ESLint no projeto
- `npm run build:backend`: compila o backend (`backend/`) via `tsc -p backend/tsconfig.json`
- `npm run start:backend`: roda o backend compilado (`backend/dist/server.js`)
- `npm run n8n:import`: importa/atualiza workflows n8n a partir de `n8n/` (`scripts/import-n8n-workflows.mjs`)

Antes de subir alteracoes, rode pelo menos `npm run lint` e `npm run build`.

## Padrao de Codigo
Use TypeScript e componentes funcionais em React. Siga o padrao atual do projeto:
- `PascalCase` para componentes e paginas
- `camelCase` para variaveis, funcoes e hooks
- `.tsx` para arquivos com JSX
- manter o estilo de indentacao ja existente no arquivo

O lint usa `typescript-eslint`, `react-hooks` e `react-refresh`. Evite usar alias `@/...` sem garantir configuracao no Vite e no TypeScript.

## Testes e Validacao
Nao existe uma suite de testes configurada nesta copia do projeto. Por enquanto, a validacao minima e:
- `npm run lint`
- `npm run build`

Se adicionar testes no futuro, prefira nomes como `ComponentName.test.tsx` e coloque os arquivos ao lado da feature ou em `src/__tests__/`.

## Commits e Pull Requests
Siga um padrao simples e objetivo, consistente com o historico do repositorio:
- `feat: adiciona tratamento de erro no login`
- `fix: corrige inicializacao do Supabase`
- `refactor: simplifica estado da rota de chat`

Toda PR deve incluir:
- resumo curto com foco no impacto de negocio
- modulos ou telas afetadas
- mudancas de ambiente, principalmente `VITE_SUPABASE_*`
- print ou gravacao curta quando houver mudanca visual

## Seguranca e Configuracao
Nao versione `.env` nem chaves do Supabase. Documente variaveis obrigatorias e mantenha segredos fora do repositorio. Quando houver dependencia externa, prefira exibir erro claro na interface em vez de falha silenciosa.

## Deploy Rapido
Para qualquer tarefa de publicacao, consulte primeiro `DEPLOY-RAPIDO.md`.

Esse arquivo resume:
- repo e branch de deploy
- VPS e caminhos reais do sistema
- comandos curtos de push/deploy
- regras do gate e formato do backup obrigatorio
- armadilhas conhecidas do ambiente atual


## Regra Operacional do Usuario
Ao concluir qualquer mudanca solicitada pelo usuario, assumir como padrao operacional:
- fazer commit das alteracoes realizadas
- fazer push para origin main
- executar o deploy conforme DEPLOY-RAPIDO.md

So deixar de seguir esse fluxo quando o usuario disser explicitamente para nao commitar, nao publicar ou apenas preparar as alteracoes localmente.
