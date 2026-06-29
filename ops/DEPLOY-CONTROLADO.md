# Deploy Controlado AVMD

Leitura rapida obrigatoria antes de operar:

- `DEPLOY-RAPIDO.md`
- `ops/ROTAS-E-SERVICOS-VPS.md`

Objetivo: publicar AVMD com a topologia real da VPS, sem depender de Nginx de host inexistente.

## Precondicoes

- Snapshot da VPS criado
- DNS apontando para `147.79.111.76`
- Backend `.env.local` preenchido no servidor
- `avmd-guard.timer` ativo
- Backup valido em `/opt/backups/certiid`

## Estrutura real que o deploy considera

- Repo na VPS: `/opt/avmd/AVMD_System`
- Frontend publicado em: `/var/www/crm.certiid.mantovan.com.br`
- Backend local em: `127.0.0.1:8787`
- Traefik publica `80/443`
- Docker service responsavel pelo edge: `avmd_web`
- Arquivo ativo do Nginx do edge: `/opt/avmd/nginx-avmd.conf`
- Arquivo fonte versionado: `ops/nginx/avmd-web.conf`

## Sequencia segura

1. Enviar scripts atualizados para a VPS, se necessario:

```bash
scp ops/scripts/vps-rollout-avmd.sh root@147.79.111.76:/root/
scp ops/scripts/vps-rollback-avmd.sh root@147.79.111.76:/root/
scp ops/scripts/vps-deploy-gate.sh root@147.79.111.76:/root/
```

2. Na VPS, garantir permissao de execucao:

```bash
chmod +x /root/vps-rollout-avmd.sh
chmod +x /root/vps-rollback-avmd.sh
chmod +x /root/vps-deploy-gate.sh
```

3. Rodar deploy obrigatoriamente pelo gate:

```bash
/root/vps-deploy-gate.sh
```

## O que o rollout faz

- atualiza o repo em `/opt/avmd/AVMD_System`
- roda `npm ci`, `npm run build` e `npm run build:backend`
- publica o frontend em `/var/www/crm.certiid.mantovan.com.br`
- reinstala o service `avmd-backend`
- valida `ops/nginx/avmd-web.conf` com container `nginx:1.27-alpine`
- copia o arquivo para `/opt/avmd/nginx-avmd.conf`
- faz `docker service update --force avmd_web`
- executa smoke tests local, roteado e publico

## Validacoes pos-deploy

```bash
systemctl status avmd-backend --no-pager
curl -fsS http://127.0.0.1:8787/healthz
curl -fsS -H "Host: api.certiid.mantovan.com.br" http://127.0.0.1/healthz
curl -fsS https://api.certiid.mantovan.com.br/healthz
```

## Critérios de go/no-go

Go:
- backend `active`
- `GET` e `HEAD` em `/healthz` respondendo `200` via edge publico
- frontend abrindo no dominio publico
- Traefik roteando `api.certiid.mantovan.com.br`

No-go:
- `docker service update --force avmd_web` falhar
- `curl` roteado via host falhar
- `curl` publico falhar com erro persistente
- backend subir localmente mas nao responder externamente

## Rollback imediato

```bash
/root/vps-rollback-avmd.sh
```

O rollback:
- para `avmd-backend`
- restaura o ultimo backup conhecido de `/opt/avmd/nginx-avmd.conf`, se existir
- recicla o service `avmd_web`

## Regras obrigatorias de deploy

O gate bloqueia deploy se qualquer regra falhar:

- guardiao inativo
- sem backup valido em `/opt/backups/certiid`
- backup mais antigo que 24h
- deploy concorrente em execucao
