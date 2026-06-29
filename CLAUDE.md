# Diretrizes do Repositorio

## Estrutura do Projeto
Este repositorio e um frontend em `Vite + React + TypeScript`. O codigo principal fica em `src/`:
- `src/components/` para componentes reutilizaveis, como `ChatPanel.tsx`
- `src/pages/` para telas de rota, como `LoginPage.tsx`
- `src/lib/` para auth, clientes e integracoes
- `src/context/` para estado compartilhado com React Context
- `src/assets/` para imagens e recursos estaticos

Arquivos publicos ficam em `public/`. Configuracoes principais ficam na raiz, como `vite.config.ts`, `eslint.config.js`, `tailwind.config.cjs` e `tsconfig*.json`.

## Comandos de Desenvolvimento
- `npm install`: instala dependencias
- `npm run dev`: sobe o servidor local do Vite
- `npm run build`: valida TypeScript e gera o bundle de producao
- `npm run preview`: publica localmente a build gerada
- `npm run lint`: executa o ESLint no projeto

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
Como o historico Git nao esta disponivel neste snapshot, siga um padrao simples e objetivo:
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

