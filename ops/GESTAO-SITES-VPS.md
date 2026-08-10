# Gestao de Sites na VPS

Este guia padroniza a gestao de sites estaticos publicados na VPS.

## Escopo

- inventariar sites publicados em `/var/www`
- publicar nova versao de um site com backup previo
- validar resposta local roteada e publica
- restaurar rapidamente o ultimo backup
- recarregar o edge (`avmd_web`) quando necessario

## Arquivos

- `ops/scripts/vps-sites-manager.ps1`
- `ops/scripts/vps-sites-manager.config.example.ps1`

## Pre-requisitos locais

- PowerShell 5.1+ ou 7+
- OpenSSH Client (`ssh` e `scp` no PATH)
- `tar` no host local
- acesso por chave SSH na VPS

## Configuracao inicial

1. Copie o exemplo de configuracao:

```powershell
Copy-Item .\ops\scripts\vps-sites-manager.config.example.ps1 .\ops\scripts\vps-sites-manager.config.ps1
```

1. Ajuste host e caminhos em `ops/scripts/vps-sites-manager.config.ps1`.

## Acoes disponiveis

Inventario dos sites:

```powershell
powershell -ExecutionPolicy Bypass -File .\ops\scripts\vps-sites-manager.ps1 -Action inventory
```

Check de um site:

```powershell
powershell -ExecutionPolicy Bypass -File .\ops\scripts\vps-sites-manager.ps1 -Action check -Domain crm.certiid.mantovan.com.br
```

Backup manual de um site:

```powershell
powershell -ExecutionPolicy Bypass -File .\ops\scripts\vps-sites-manager.ps1 -Action backup -Domain crm.certiid.mantovan.com.br
```

Publicar um site (com backup automatico):

```powershell
powershell -ExecutionPolicy Bypass -File .\ops\scripts\vps-sites-manager.ps1 -Action publish -Domain crm.certiid.mantovan.com.br -LocalPath .\dist
```

Rollback para o ultimo backup:

```powershell
powershell -ExecutionPolicy Bypass -File .\ops\scripts\vps-sites-manager.ps1 -Action rollback -Domain crm.certiid.mantovan.com.br
```

Recarregar edge:

```powershell
powershell -ExecutionPolicy Bypass -File .\ops\scripts\vps-sites-manager.ps1 -Action edge-reload
```

Execucao remota customizada:

```powershell
powershell -ExecutionPolicy Bypass -File .\ops\scripts\vps-sites-manager.ps1 -Action exec -RemoteCommand "docker service ls"
```

## Fluxo recomendado de publicacao

1. Build local do site.
1. `backup` do dominio alvo.
1. `publish` para o dominio alvo.
1. `edge-reload` se houver alteracao de comportamento no edge.
1. `check` para validar rota local e URL publica.

## Modo simulacao

```powershell
powershell -ExecutionPolicy Bypass -File .\ops\scripts\vps-sites-manager.ps1 -Action publish -Domain crm.certiid.mantovan.com.br -LocalPath .\dist -DryRun
```

## Observacoes de seguranca

- Publicar sempre por dominio explicito (`-Domain`).
- Nao usar `-SkipBackup` em rotina normal.
- Manter backups fora do mesmo disco da aplicacao sempre que possivel.
- Restringir acesso SSH por chave e IP.

## WordPress

Para migracao de site WordPress pronto (Hostinger -> VPS), use o runbook:

- `ops/WORDPRESS-HOSTINGER-MIGRACAO.md`
