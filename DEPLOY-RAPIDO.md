# Mapa Rapido de Deploy AVMD

Use este arquivo como ponto de entrada rapido para deploy, commit e diagnostico do ambiente.

## Para qualquer IA ou nova sessao

O acesso nao depende do historico da conversa. Ele depende das credenciais ja instaladas nesta maquina:

- GitHub: o remote `origin` abaixo deve responder a `git ls-remote` e ao `git push`.
- VPS: a chave SSH local deve permitir acesso nao interativo ao host abaixo.
- Nunca pedir, copiar ou versionar senha, token ou chave privada.

Antes de trabalhar, execute na raiz do repositorio:

```powershell
powershell -ExecutionPolicy Bypass -File .\ops\scripts\windows-access-check.ps1
```

O comando compara os commits local, GitHub e VPS, confirma o backend e mostra mudancas locais. Uma falha deve ser diagnosticada; nao se deve concluir genericamente que a IA "nao tem acesso" sem executar essa checagem.

## Repositorio

- Repo Git: `https://github.com/mantovanio/AVMD_System.git`
- Branch de deploy: `main`
- Fluxo padrao: salvar local -> `git add` -> `git commit` -> `git push origin main` -> deploy na VPS

## Build local

- Frontend: `npm run build`
- Backend: `npm run build:backend`
- Validacao minima antes de push: `npm run build`

## VPS de producao

- Host: `root@147.79.111.76`
- App dir na VPS: `/opt/avmd/AVMD_System`
- Frontend publicado em: `/var/www/crm.certiid.mantovan.com.br`
- Backend systemd: `avmd-backend`
- Health local backend: `http://127.0.0.1:8787/healthz`

## Edge real do servidor

Nao assumir Nginx em `/etc/nginx`.

A estrutura real e:

- Traefik publica `80/443`
- Docker Swarm service: `avmd_web`
- Config do Nginx desse service na VPS: `/opt/avmd/nginx-avmd.conf`
- Arquivo fonte versionado no repo: `ops/nginx/avmd-web.conf`

Resumo:
- `crm.certiid.com.br` serve o frontend estatico
- `crm.certiid.mantovan.com.br` permanece como dominio legado/fallback
- `api.certiid.com.br` faz proxy para `http://172.18.0.1:8787`
- `api.certiid.mantovan.com.br` permanece como dominio legado/fallback

## Scripts importantes na VPS

- Gate canonico: `/opt/avmd/AVMD_System/ops/scripts/vps-deploy-gate.sh`
- Rollout canonico: `/opt/avmd/AVMD_System/ops/scripts/vps-rollout-avmd.sh`
- Rollback canonico: `/opt/avmd/AVMD_System/ops/scripts/vps-rollback-avmd.sh`
- Wrappers legados em `/root/*.sh`: apenas compatibilidade; devem apontar para os scripts canonicos

Regra: nao rodar rollout direto. Sempre usar o gate.

## Gate e backup obrigatorio

O gate valida:
- `avmd-guard.timer` ativo
- backup recente em `/opt/backups/certiid`
- lock anti-concorrencia

Formato esperado do backup mais novo:
- pasta: `/opt/backups/certiid/YYYYMMDD-HHMMSS`
- arquivo obrigatorio dentro: `opt-certiid.tar.gz`

Se a pasta mais nova nao tiver esse arquivo, o deploy bloqueia.

## Protecao da configuracao Clerk/API

Antes do build, o rollout executa automaticamente:

```text
ops/scripts/validate-production-env.sh
```

Esse validador le `/opt/avmd/AVMD_System/.env.production` e bloqueia a publicacao se:

- `VITE_CLERK_PUBLISHABLE_KEY` estiver ausente, for `pk_test_` ou nao for uma chave live do dominio `certiid.com.br`;
- `VITE_API_BASE_URL` nao for `https://api.certiid.com.br/api`;
- `.env.production` nao existir.

Quando a validacao passa, uma copia protegida da configuracao e criada em `.deploy-env-backups/` no servidor, mantendo as dez ultimas versoes. A chamada e feita por `ops/scripts/vps-rollout-avmd.sh`, logo uma configuracao Clerk de outro dominio interrompe o deploy antes de publicar o frontend.

## Comandos curtos de operacao

Push:

```powershell
git -C C:\projetos\AVMD_System push origin main
```

Se `origin/main` estiver atras da branch local, o push deve ser concluido antes do deploy. A VPS nao deve ser usada como substituta do GitHub: o GitHub e a fonte compartilhada para retomada por outras ferramentas.

Deploy:

```powershell
& 'C:\Program Files\Git\usr\bin\ssh.exe' root@147.79.111.76 'bash /opt/avmd/AVMD_System/ops/scripts/vps-deploy-gate.sh'
```

Status backend e edge:

```powershell
& 'C:\Program Files\Git\usr\bin\ssh.exe' root@147.79.111.76 'systemctl status avmd-backend --no-pager; curl -fsS http://127.0.0.1:8787/healthz; curl -fsS -H "Host: api.certiid.mantovan.com.br" http://127.0.0.1/healthz'
```

Aplicar migracao SQL versionada no banco do backend:

```powershell
npm run db:apply-sql -- backend/sql/026_fix_legacy_email_schedule_phone.sql
```

Preview sem aplicar:

```powershell
npm run db:apply-sql:dry-run -- backend/sql/026_fix_legacy_email_schedule_phone.sql
```

## Padrao para migracoes SQL

- Toda migracao nova deve ficar versionada em `backend/sql/`.
- O fluxo padrao nao e mais `psql` manual colado no terminal.
- Use sempre `npm run db:apply-sql -- <arquivo.sql>`.
- Para validar antes, use `npm run db:apply-sql:dry-run -- <arquivo.sql>`.
- O script le `DATABASE_URL` de `backend/.env.local`.
- O script registra aplicacoes na tabela `avmd_sql_migrations`.
- Se a mesma migracao ja tiver sido aplicada com o mesmo checksum, ele ignora com seguranca.
- Se o nome do arquivo ja existir com checksum diferente, ele bloqueia por seguranca.
- `--force` so deve ser usado em caso excepcional e consciente.

## Publicacao e rotas reais

- Dominio do frontend: `https://crm.certiid.com.br`
- Dominio legado do frontend: `https://crm.certiid.mantovan.com.br`
- Dominio da API: `https://api.certiid.com.br/healthz`
- Dominio legado da API: `https://api.certiid.mantovan.com.br/healthz`
- Para o mapa completo da VPS: `ops/ROTAS-E-SERVICOS-VPS.md`
- Para o historico da recuperacao do dominio novo, Clerk e DNS: `ops/RECUPERACAO-CRM-CERTIID-2026-08-13.md`

## Armadilhas conhecidas

- O workflow `.github/workflows/jekyll-docker.yml` nao faz deploy do painel React do AVMD.
- O servidor atual responde em `80/443` via Traefik em Docker.
- Deploy via wrapper antigo desatualizado em `/root/vps-rollout-avmd.sh` pode executar etapa legada de `/etc/nginx/sites-available/...` e deixar o backend sem restart.
- O fluxo oficial deve chamar sempre o script canonico em `/opt/avmd/AVMD_System/ops/scripts/`.
- Os wrappers em `/root/*.sh` precisam ser sincronizados pelo instalador `ops/scripts/vps-install-root-deploy-shims.sh`.

## Arquivos para consultar primeiro

- `DEPLOY-RAPIDO.md`
- `ops/ROTAS-E-SERVICOS-VPS.md`
- `ops/DEPLOY-CONTROLADO.md`
- `ops/scripts/vps-deploy-gate.sh`
- `ops/scripts/vps-rollout-avmd.sh`
