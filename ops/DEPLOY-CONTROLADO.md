# Deploy Controlado AVMD (com Snapshot ja criado)

Leitura rapida obrigatoria antes de operar: DEPLOY-RAPIDO.md.

Objetivo: subir AVMD em paralelo sem substituir o CRM antigo.

## Precondicoes

- Snapshot da VPS ja criado (ok)
- DNS pronto:
  - crm.certiid.mantovan.com.br
  - api.certiid.mantovan.com.br
- Arquivo backend/.env.local preenchido no servidor

## Sequencia segura

1. Enviar scripts para a VPS:

scp ops/scripts/vps-rollout-avmd.sh root@147.79.111.76:/root/
scp ops/scripts/vps-rollback-avmd.sh root@147.79.111.76:/root/
scp ops/scripts/vps-deploy-gate.sh root@147.79.111.76:/root/

2. Acessar VPS:

ssh root@147.79.111.76

3. Tornar scripts executaveis:

chmod +x /root/vps-rollout-avmd.sh
chmod +x /root/vps-rollback-avmd.sh
chmod +x /root/vps-deploy-gate.sh

4. Rodar rollout (obrigatorio via gate):

/root/vps-deploy-gate.sh

Observacao: o script de rollout foi travado e nao roda direto.
Se tentar executar `/root/vps-rollout-avmd.sh` sem gate, ele bloqueia.

5. Validar saude:

systemctl status avmd-backend --no-pager
curl -fsS http://127.0.0.1:8787/healthz

6. Validar publico:

- abrir https://crm.certiid.mantovan.com.br
- testar endpoint https://api.certiid.mantovan.com.br/healthz

## Critérios de go/no-go

Go:
- chatwoot e n8n seguem com CPU e memoria estaveis
- avmd-backend ativo
- healthchecks ok

No-go:
- aumento anormal de carga
- timeout frequente no N8N/Chatwoot
- erro 5xx persistente

## Rollback imediato

/root/vps-rollback-avmd.sh

Isso para o AVMD e remove roteamento nginx do AVMD, mantendo CRM antigo operando.

## Protecao automatica opcional (anti-oscilacao)

Se quiser que o sistema se proteja sozinho quando a VPS entrar em estresse continuo:

1. Copiar guardiao e units:

scp ops/scripts/vps-avmd-guard.sh root@147.79.111.76:/usr/local/bin/
scp ops/systemd/avmd-guard.service root@147.79.111.76:/etc/systemd/system/
scp ops/systemd/avmd-guard.timer root@147.79.111.76:/etc/systemd/system/

2. Na VPS, ajustar permissao e ativar timer:

chmod +x /usr/local/bin/vps-avmd-guard.sh
systemctl daemon-reload
systemctl enable --now avmd-guard.timer

3. Validar:

systemctl status avmd-guard.timer --no-pager
journalctl -u avmd-guard.service -n 30 --no-pager
tail -n 30 /var/log/avmd-guard.log

Comportamento:
- Roda a cada 2 minutos.
- Se carga alta persistir por 3 ciclos seguidos, executa rollback automatico do AVMD.
- N8N e Chatwoot permanecem como prioridade na VPS.

## Regras obrigatorias de deploy (travadas)

O gate `/root/vps-deploy-gate.sh` bloqueia deploy se qualquer regra falhar:

- Guardiao inativo (`avmd-guard.timer`)
- Sem backup valido em `/opt/backups/certiid`
- Backup mais antigo que 24h (ajustavel por `BACKUP_MAX_AGE_HOURS`)
- Deploy concorrente ja em execucao (lock em `/var/lock/avmd-deploy.lock`)

