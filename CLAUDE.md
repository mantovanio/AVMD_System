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
- `npm run db:apply-sql -- backend/sql/026_fix_legacy_email_schedule_phone.sql`: aplica uma migracao SQL versionada no banco configurado em `backend/.env.local`
- `npm run db:apply-sql:dry-run -- backend/sql/026_fix_legacy_email_schedule_phone.sql`: valida uma migracao sem aplicar nada no banco
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


## Fila de Commits (Pending Queue)
Para evitar colisoes com outras ferramentas de manutencao, todo commit e interceptado pelo git hook `commit-msg` e redirecionado para `pending-commits/` como patch.

### Fluxo
1. **Qualquer `git commit`** → hook cria patch em `pending-commits/` com hash SHA256 e limpa a working tree
2. **Para efetivar** todos os patches pendentes em ordem:
   ```bash
   PENDING_QUEUE_APPLY=1 bash pending-commits/aplicar-todos.sh
   ```
3. **Para ver a fila**: `ls pending-commits/*.patch`

### Como funciona
- O hook calcula SHA256 do diff e verifica se ja existe patch ou commit com o mesmo hash → se sim, ignora
- Ao aplicar, o hash e gravado no footer do commit (`Patch-Hash: sha256:...`)
- O `aplicar-todos.sh` usa env var `PENDING_QUEUE_APPLY=1` para bypassar o proprio hook
- A working tree e limpa apos cada enfileiramento (as mudancas estao seguras no patch)

### Instalacao dos hooks (uma vez)
Ja instalados em `.git/hooks/{pre-commit,commit-msg}`. Para reinstalar:
```bash
cp pending-commits/pre-commit.sh .git/hooks/pre-commit
cp pending-commits/commit-msg.sh .git/hooks/commit-msg
```

### Push e Deploy
Consulte `DEPLOY-RAPIDO.md` para push e deploy. So fazer push depois que `aplicar-todos.sh` for executado e validado.
