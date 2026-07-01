# Mapa Rapido de Deploy AVMD

Use este arquivo como ponto de entrada rapido para deploy, commit e diagnostico do ambiente.

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
- `crm.certiid.mantovan.com.br` serve o frontend estatico
- `api.certiid.mantovan.com.br` faz proxy para `http://172.18.0.1:8787`

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

## Comandos curtos de operacao

Push:

```powershell
git -C C:\projetos\AVMD_System push origin main
```

Deploy:

```powershell
& 'C:\Program Files\Git\usr\bin\ssh.exe' root@147.79.111.76 'bash /opt/avmd/AVMD_System/ops/scripts/vps-deploy-gate.sh'
```

Status backend e edge:

```powershell
& 'C:\Program Files\Git\usr\bin\ssh.exe' root@147.79.111.76 'systemctl status avmd-backend --no-pager; curl -fsS http://127.0.0.1:8787/healthz; curl -fsS -H "Host: api.certiid.mantovan.com.br" http://127.0.0.1/healthz'
```

## Publicacao e rotas reais

- Dominio do frontend: `https://crm.certiid.mantovan.com.br`
- Dominio da API: `https://api.certiid.mantovan.com.br/healthz`
- Para o mapa completo da VPS: `ops/ROTAS-E-SERVICOS-VPS.md`

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
