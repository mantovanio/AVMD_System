# Gestao da VPS AVMD

Este guia cria um ponto unico de operacao da VPS usando os scripts ja existentes do projeto.

## Objetivo

Padronizar operacoes de:

- status
- healthcheck
- deploy controlado
- rollback
- preflight
- logs
- verificacao de backup

## Arquivos criados

- `ops/scripts/vps-manager.ps1`
- `ops/scripts/vps-manager.config.example.ps1`

## Pre-requisitos locais (Windows)

- PowerShell 5.1+ ou PowerShell 7+
- OpenSSH Client instalado (`ssh` no PATH)
- Chave SSH com acesso ao host `root@147.79.111.76`

## Configuracao inicial

1. Copiar o arquivo de exemplo:

```powershell
Copy-Item .\ops\scripts\vps-manager.config.example.ps1 .\ops\scripts\vps-manager.config.ps1
```

1. Ajustar os valores em `ops/scripts/vps-manager.config.ps1` se necessario.

## Uso rapido

Executar da raiz do repositorio `AVMD_System`.

Status geral:

```powershell
powershell -ExecutionPolicy Bypass -File .\ops\scripts\vps-manager.ps1 -Action status
```

Healthchecks:

```powershell
powershell -ExecutionPolicy Bypass -File .\ops\scripts\vps-manager.ps1 -Action health
```

Preflight:

```powershell
powershell -ExecutionPolicy Bypass -File .\ops\scripts\vps-manager.ps1 -Action preflight
```

Deploy (gate oficial):

```powershell
powershell -ExecutionPolicy Bypass -File .\ops\scripts\vps-manager.ps1 -Action deploy
```

Rollback:

```powershell
powershell -ExecutionPolicy Bypass -File .\ops\scripts\vps-manager.ps1 -Action rollback
```

Logs backend:

```powershell
powershell -ExecutionPolicy Bypass -File .\ops\scripts\vps-manager.ps1 -Action logs-backend
```

Logs guard:

```powershell
powershell -ExecutionPolicy Bypass -File .\ops\scripts\vps-manager.ps1 -Action logs-guard
```

Verificar backups:

```powershell
powershell -ExecutionPolicy Bypass -File .\ops\scripts\vps-manager.ps1 -Action backup-check
```

Recarregar edge:

```powershell
powershell -ExecutionPolicy Bypass -File .\ops\scripts\vps-manager.ps1 -Action edge-reload
```

Comando remoto customizado:

```powershell
powershell -ExecutionPolicy Bypass -File .\ops\scripts\vps-manager.ps1 -Action exec -RemoteCommand "docker ps"
```

## Modo simulacao

Para validar o comando sem executar na VPS:

```powershell
powershell -ExecutionPolicy Bypass -File .\ops\scripts\vps-manager.ps1 -Action deploy -DryRun
```

## Fluxo operacional recomendado

1. `preflight`
2. `backup-check`
3. `deploy`
4. `health`
5. `status`

Se falhar:

1. `logs-backend`
2. `logs-guard`
3. `rollback`
4. `health`

## Referencias

- `ops/DEPLOY-CONTROLADO.md`
- `ops/ROTAS-E-SERVICOS-VPS.md`
- `ops/GESTAO-SITES-VPS.md`
