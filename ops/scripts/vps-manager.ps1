param(
  [ValidateSet('status','health','deploy','rollback','preflight','edge-reload','logs-backend','logs-guard','backup-check','exec')]
  [string]$Action = 'status',
  [string]$SshHost = 'root@147.79.111.76',
  [string]$RepoPath = '/opt/avmd/AVMD_System',
  [string]$BackendService = 'avmd-backend',
  [string]$GuardService = 'avmd-guard.timer',
  [string]$EdgeService = 'avmd_web',
  [string]$ConfigPath = '',
  [string]$RemoteCommand = '',
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'

function Write-Section {
  param([string]$Title)
  Write-Host ""
  Write-Host "== $Title ==" -ForegroundColor Cyan
}

function Resolve-DefaultConfigPath {
  return (Join-Path $PSScriptRoot 'vps-manager.config.ps1')
}

function Import-Config {
  param([string]$Path)

  if ([string]::IsNullOrWhiteSpace($Path)) {
    $Path = Resolve-DefaultConfigPath
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
  if ($cfg.RepoPath) { $script:RepoPath = [string]$cfg.RepoPath }
  if ($cfg.BackendService) { $script:BackendService = [string]$cfg.BackendService }
  if ($cfg.GuardService) { $script:GuardService = [string]$cfg.GuardService }
  if ($cfg.EdgeService) { $script:EdgeService = [string]$cfg.EdgeService }
}

function Assert-SshAvailable {
  $sshCmd = Get-Command ssh -ErrorAction SilentlyContinue
  if ($null -eq $sshCmd) {
    throw 'OpenSSH client nao encontrado. Instale o OpenSSH Client no Windows e tente novamente.'
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

function Show-Status {
  Write-Section 'Resumo do host'
  Invoke-Remote "hostnamectl --static; uptime"

  Write-Section 'Branch e ultimo commit do repo'
  Invoke-Remote "git -C '$RepoPath' rev-parse --abbrev-ref HEAD; git -C '$RepoPath' log -1 --pretty='format:%h %ad %s' --date=iso"

  Write-Section 'Services principais'
  Invoke-Remote "systemctl is-active '$BackendService'; systemctl is-active '$GuardService'; docker service ls --format '{{.Name}} {{.Replicas}}' | grep '$EdgeService'"
}

function Show-Health {
  Write-Section 'Health backend local'
  Invoke-Remote "curl -fsS http://127.0.0.1:8787/healthz"

  Write-Section 'Health roteado no host'
  Invoke-Remote "curl -fsS -H 'Host: api.certiid.mantovan.com.br' http://127.0.0.1/healthz"

  Write-Section 'Health publico'
  Invoke-Remote "curl -fsS https://api.certiid.mantovan.com.br/healthz"
}

function Invoke-Deploy {
  Write-Section 'Deploy pelo gate'
  Invoke-Remote "'$RepoPath'/ops/scripts/vps-deploy-gate.sh"
}

function Invoke-Rollback {
  Write-Section 'Rollback AVMD'
  Invoke-Remote "'$RepoPath'/ops/scripts/vps-rollback-avmd.sh"
}

function Invoke-Preflight {
  Write-Section 'Preflight da VPS'
  Invoke-Remote "'$RepoPath'/ops/scripts/vps-preflight.sh"
}

function Update-EdgeService {
  Write-Section 'Recarregando edge avmd_web'
  Invoke-Remote "docker service update --force '$EdgeService'"
}

function Show-BackendLogs {
  Write-Section 'Ultimas 120 linhas do backend'
  Invoke-Remote "journalctl -u '$BackendService' -n 120 --no-pager"
}

function Show-GuardLogs {
  Write-Section 'Ultimas 120 linhas do guardiao'
  Invoke-Remote "journalctl -u avmd-guard -n 120 --no-pager; journalctl -u '$GuardService' -n 120 --no-pager"
}

function Show-BackupStatus {
  Write-Section 'Backups em /opt/backups/certiid'
  Invoke-Remote "ls -lah /opt/backups/certiid | tail -n 20"

  Write-Section 'Backup mais recente e idade (segundos)'
  $cmd = 'newest=$(ls -1t /opt/backups/certiid 2>/dev/null | head -n 1); if [ -z "$newest" ]; then echo "Nenhum backup encontrado"; exit 1; fi; path=/opt/backups/certiid/$newest; now=$(date +%s); mtime=$(stat -c %Y "$path"); age=$((now-mtime)); echo "$path"; echo "idade_segundos=$age"'
  Invoke-Remote $cmd
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
  Assert-SshAvailable
}

switch ($Action) {
  'status' { Show-Status; break }
  'health' { Show-Health; break }
  'deploy' { Invoke-Deploy; break }
  'rollback' { Invoke-Rollback; break }
  'preflight' { Invoke-Preflight; break }
  'edge-reload' { Update-EdgeService; break }
  'logs-backend' { Show-BackendLogs; break }
  'logs-guard' { Show-GuardLogs; break }
  'backup-check' { Show-BackupStatus; break }
  'exec' { Invoke-CustomRemoteCommand; break }
  default { throw "Acao nao suportada: $Action" }
}
