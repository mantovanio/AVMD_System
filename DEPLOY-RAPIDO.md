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

## Scripts importantes na VPS

- Gate de deploy: `/root/vps-deploy-gate.sh`
- Rollout: `/root/vps-rollout-avmd.sh`
- Rollback: `/root/vps-rollback-avmd.sh`

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
& 'C:\Program Files\Git\usr\bin\ssh.exe' root@147.79.111.76 'bash /root/vps-deploy-gate.sh'
```

Status backend:

```powershell
& 'C:\Program Files\Git\usr\bin\ssh.exe' root@147.79.111.76 'systemctl status avmd-backend --no-pager; curl -fsS http://127.0.0.1:8787/healthz'
```

## Publicacao e rotas reais

- Dominio do frontend: `https://crm.certiid.mantovan.com.br`
- Dominio esperado da API: `https://api.certiid.mantovan.com.br`
- O frontend usa os arquivos estaticos publicados em `/var/www/crm.certiid.mantovan.com.br`

## Armadilhas conhecidas

- O workflow `.github/workflows/jekyll-docker.yml` nao faz deploy do painel React do AVMD. Ele nao deve ser usado como referencia principal de deploy.
- O servidor atual responde em `80/443` via `docker-proxy`.
- O script `ops/scripts/vps-rollout-avmd.sh` tenta copiar config para `/etc/nginx/sites-available/...`, mas esse caminho pode nao existir no servidor atual.
- Mesmo quando a etapa de Nginx falha, o frontend pode ja ter sido publicado em `/var/www/crm.certiid.mantovan.com.br`.

## Arquivos para consultar primeiro

- `DEPLOY-RAPIDO.md`
- `ops/DEPLOY-CONTROLADO.md`
- `ops/scripts/vps-deploy-gate.sh`
- `ops/scripts/vps-rollout-avmd.sh`
