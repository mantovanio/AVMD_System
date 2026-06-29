# Infra Real da VPS AVMD

Este arquivo descreve a estrutura real de producao para deploy e diagnostico rapido.

## Host e repositorio

- VPS: `root@147.79.111.76`
- Repo na VPS: `/opt/avmd/AVMD_System`
- Branch de deploy: `main`

## Publicacao do frontend

- Build local do painel: `dist/`
- Publicacao na VPS: `/var/www/crm.certiid.mantovan.com.br`
- Dominio publico: `https://crm.certiid.mantovan.com.br`

## Backend

- Service systemd: `avmd-backend`
- Porta local: `8787`
- Health local: `http://127.0.0.1:8787/healthz`
- Codigo-fonte do backend: `backend/`

## Edge HTTP real

O servidor nao usa Nginx de host em `/etc/nginx`.

A borda publica funciona assim:

- `traefik_traefik` publica `80/443`
- O service Docker Swarm `avmd_web` recebe os hosts publicos do AVMD
- O container `avmd_web` usa o arquivo `/opt/avmd/nginx-avmd.conf`
- O frontend do container monta `/var/www/crm.certiid.mantovan.com.br` em `/usr/share/nginx/html`

## Arquivo fonte do proxy no repositorio

- Fonte versionada: `ops/nginx/avmd-web.conf`
- Destino na VPS: `/opt/avmd/nginx-avmd.conf`

Esse arquivo atende:

- `crm.certiid.mantovan.com.br` com SPA React
- `api.certiid.mantovan.com.br` com proxy para `http://172.18.0.1:8787`

## Healthchecks corretos

- Backend direto: `curl -fsS http://127.0.0.1:8787/healthz`
- Via Traefik no host: `curl -fsS -H "Host: api.certiid.mantovan.com.br" http://127.0.0.1/healthz`
- Publico: `curl -fsS https://api.certiid.mantovan.com.br/healthz`

Observacao:
- `HEAD /healthz` agora deve responder `200` via edge do `avmd_web`.
- O falso negativo anterior aconteceu porque o backend aceitava apenas `GET /healthz`; o proxy agora normaliza esse healthcheck para `GET`.

## Comandos operacionais

Deploy com gate:

```bash
/root/vps-deploy-gate.sh
```

Recarregar edge manualmente, se necessario:

```bash
docker service update --force avmd_web
```

Status rapido:

```bash
systemctl status avmd-backend --no-pager
curl -fsS http://127.0.0.1:8787/healthz
curl -fsS -H "Host: api.certiid.mantovan.com.br" http://127.0.0.1/healthz
```
