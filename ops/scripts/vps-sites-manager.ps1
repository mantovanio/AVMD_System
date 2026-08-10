param(
  [ValidateSet('inventory','check','publish','backup','rollback','edge-reload','exec')]
  [string]$Action = 'inventory',
  [string]$SshHost = 'root@147.79.111.76',
  [string]$Domain = '',
  [string]$LocalPath = '',
  [string]$RemoteRoot = '/var/www',
  [string]$BackupRoot = '/opt/backups/sites',
  [string]$EdgeService = 'avmd_web',
  [string]$ConfigPath = '',
  [string]$RemoteCommand = '',
  [switch]$SkipBackup,
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'

function Write-Section {
  param([string]$Title)
  Write-Host ""
  Write-Host "== $Title ==" -ForegroundColor Cyan
}

function Get-DefaultConfigPath {
  return (Join-Path $PSScriptRoot 'vps-sites-manager.config.ps1')
}

function Import-Config {
  param([string]$Path)

  if ([string]::IsNullOrWhiteSpace($Path)) {
    $Path = Get-DefaultConfigPath
  }

  if (-not (Test-Path -LiteralPath $Path)) {
    return
  }

  $cfg = & $Path
  if ($null -eq $cfg) {
    throw "Arquivo de configuracao invalido: $Path"
  }

  if ($cfg.SshHost) { $script:SshHost = [string]$cfg.SshHost }
  if ($cfg.Host) { $script:SshHost = [string]$cfg.Host }
  if ($cfg.RemoteRoot) { $script:RemoteRoot = [string]$cfg.RemoteRoot }
  if ($cfg.BackupRoot) { $script:BackupRoot = [string]$cfg.BackupRoot }
  if ($cfg.EdgeService) { $script:EdgeService = [string]$cfg.EdgeService }
}

function Assert-Tools {
  param([string[]]$Tools)
  foreach ($tool in $Tools) {
    if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
      throw "Ferramenta obrigatoria nao encontrada: $tool"
    }
  }
}

function Assert-DomainRequired {
  if ([string]::IsNullOrWhiteSpace($Domain)) {
    throw 'Informe -Domain para esta acao.'
  }
}

function Invoke-Remote {
  param([string]$Command)

  if ([string]::IsNullOrWhiteSpace($Command)) {
    throw 'Comando remoto vazio.'
  }

  if ($DryRun) {
    Write-Host "[dry-run] ssh $SshHost \"$Command\"" -ForegroundColor Yellow
    return
  }

  & ssh -o BatchMode=yes $SshHost $Command
  if ($LASTEXITCODE -ne 0) {
    throw "Falha ao executar comando remoto (exit code $LASTEXITCODE)."
  }
}

function Invoke-CopyToRemote {
  param(
    [string]$LocalFile,
    [string]$RemoteFile
  )

  if ($DryRun) {
    Write-Host "[dry-run] scp $LocalFile $SshHost`:$RemoteFile" -ForegroundColor Yellow
    return
  }

  & scp -q $LocalFile "$SshHost`:$RemoteFile"
  if ($LASTEXITCODE -ne 0) {
    throw "Falha no envio de arquivo via scp (exit code $LASTEXITCODE)."
  }
}

function Show-Inventory {
  Write-Section 'Inventario de sites em /var/www'
  Invoke-Remote "ls -lah '$RemoteRoot'"

  Write-Section 'Uso de disco por site'
  Invoke-Remote "du -sh '$RemoteRoot'/* 2>/dev/null || true"
}

function Test-Site {
  Assert-DomainRequired

  Write-Section "Check local roteado ($Domain)"
  Invoke-Remote "curl -sS -o /dev/null -w '%{http_code}`n' -H 'Host: $Domain' http://127.0.0.1/"

  Write-Section "Check publico (https://$Domain)"
  Invoke-Remote "curl -sS -o /dev/null -w '%{http_code}`n' https://$Domain/"
}

function New-SiteBackup {
  Assert-DomainRequired

  $remoteDir = "$RemoteRoot/$Domain"
  $cmd = @'
set -euo pipefail; mkdir -p '{0}/{1}'; ts=$(date +%Y%m%d-%H%M%S); if [ -d '{2}' ]; then tar -czf '{0}/{1}/site-'$ts'.tar.gz' -C '{2}' .; echo '{0}/{1}/site-'$ts'.tar.gz'; else echo 'Diretorio nao existe: {2}'; exit 1; fi
'@ -f $BackupRoot, $Domain, $remoteDir

  Write-Section 'Gerando backup do site'
  Invoke-Remote $cmd
}

function Restore-SiteBackup {
  Assert-DomainRequired

  $remoteDir = "$RemoteRoot/$Domain"
  $cmd = @'
set -euo pipefail; latest=$(ls -1t '{0}/{1}'/site-*.tar.gz 2>/dev/null | head -n 1); if [ -z "$latest" ]; then echo 'Nenhum backup encontrado para {1}'; exit 1; fi; mkdir -p '{2}'; find '{2}' -mindepth 1 -delete; tar -xzf "$latest" -C '{2}'; chown -R www-data:www-data '{2}' 2>/dev/null || true; find '{2}' -type d -exec chmod 755 {{}} +; find '{2}' -type f -exec chmod 644 {{}} +; echo "Restaurado: $latest"
'@ -f $BackupRoot, $Domain, $remoteDir

  Write-Section 'Restaurando ultimo backup do site'
  Invoke-Remote $cmd
}

function Publish-Site {
  Assert-DomainRequired

  if ([string]::IsNullOrWhiteSpace($LocalPath)) {
    throw 'Informe -LocalPath para a acao publish.'
  }
  if (-not (Test-Path -LiteralPath $LocalPath)) {
    throw "Pasta local nao encontrada: $LocalPath"
  }

  $resolvedLocalPath = (Resolve-Path -LiteralPath $LocalPath).Path
  $archiveName = "site-$Domain-$([DateTime]::UtcNow.ToString('yyyyMMddHHmmss')).tar.gz"
  $archivePath = Join-Path $env:TEMP $archiveName
  $remoteTmp = "/tmp/$archiveName"
  $remoteDir = "$RemoteRoot/$Domain"

  Write-Section 'Compactando pacote local do site'
  if ($DryRun) {
    Write-Host "[dry-run] tar -czf $archivePath -C $resolvedLocalPath ." -ForegroundColor Yellow
  } else {
    if (Test-Path -LiteralPath $archivePath) {
      Remove-Item -LiteralPath $archivePath -Force
    }
    & tar -czf $archivePath -C $resolvedLocalPath .
    if ($LASTEXITCODE -ne 0) {
      throw "Falha ao compactar site local (exit code $LASTEXITCODE)."
    }
  }

  if (-not $SkipBackup) {
    New-SiteBackup
  }

  Write-Section 'Enviando pacote para a VPS'
  Invoke-CopyToRemote -LocalFile $archivePath -RemoteFile $remoteTmp

  Write-Section 'Publicando arquivos do site na VPS'
  $publishCmd = "set -euo pipefail; mkdir -p '$remoteDir'; find '$remoteDir' -mindepth 1 -delete; tar -xzf '$remoteTmp' -C '$remoteDir'; chown -R www-data:www-data '$remoteDir' 2>/dev/null || true; find '$remoteDir' -type d -exec chmod 755 {} +; find '$remoteDir' -type f -exec chmod 644 {} +; rm -f '$remoteTmp'"
  Invoke-Remote $publishCmd

  if (-not $DryRun -and (Test-Path -LiteralPath $archivePath)) {
    Remove-Item -LiteralPath $archivePath -Force
  }

  Write-Host "Publicacao concluida para $Domain em $remoteDir" -ForegroundColor Green
}

function Update-Edge {
  Write-Section "Recarregando edge service $EdgeService"
  Invoke-Remote "docker service update --force '$EdgeService'"
}

function Invoke-CustomRemoteCommand {
  if ([string]::IsNullOrWhiteSpace($RemoteCommand)) {
    throw 'Use -RemoteCommand para a acao exec.'
  }

  Write-Section 'Execucao remota customizada'
  Invoke-Remote $RemoteCommand
}

Import-Config -Path $ConfigPath

if (-not $DryRun) {
  $tools = @('ssh')
  if ($Action -eq 'publish') {
    $tools += @('scp', 'tar')
  }
  Assert-Tools -Tools $tools
}

switch ($Action) {
  'inventory' { Show-Inventory; break }
  'check' { Test-Site; break }
  'publish' { Publish-Site; break }
  'backup' { New-SiteBackup; break }
  'rollback' { Restore-SiteBackup; break }
  'edge-reload' { Update-Edge; break }
  'exec' { Invoke-CustomRemoteCommand; break }
  default { throw "Acao nao suportada: $Action" }
}
