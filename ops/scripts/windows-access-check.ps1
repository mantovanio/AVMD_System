[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$sshPath = 'C:\Program Files\Git\usr\bin\ssh.exe'
$vpsHost = 'root@147.79.111.76'
$vpsRepo = '/opt/avmd/AVMD_System'
$failed = $false

function Write-CheckResult {
    param(
        [string]$Name,
        [bool]$Ok,
        [string]$Details
    )

    $status = if ($Ok) { 'OK' } else { 'FALHA' }
    Write-Host "[$status] $Name - $Details"
    if (-not $Ok) {
        $script:failed = $true
    }
}

Push-Location $repoRoot
try {
    $localHead = (git rev-parse HEAD).Trim()
    $remoteLine = git ls-remote --heads origin main
    if ($LASTEXITCODE -ne 0 -or -not $remoteLine) {
        Write-CheckResult 'GitHub' $false 'nao foi possivel ler origin/main'
    }
    else {
        $githubHead = ($remoteLine -split '\s+')[0]
        Write-CheckResult 'GitHub' ($githubHead -eq $localHead) "local=$($localHead.Substring(0, 7)) origin/main=$($githubHead.Substring(0, 7))"
    }

    if (-not (Test-Path -LiteralPath $sshPath)) {
        Write-CheckResult 'SSH' $false "cliente nao encontrado em $sshPath"
    }
    else {
        $remoteCommand = "cd $vpsRepo && printf 'HEAD=' && git rev-parse HEAD && printf 'BACKEND=' && systemctl is-active avmd-backend && printf 'HEALTH=' && curl -fsS http://127.0.0.1:8787/healthz"
        $vpsOutput = & $sshPath -o BatchMode=yes -o ConnectTimeout=10 $vpsHost $remoteCommand 2>&1
        if ($LASTEXITCODE -ne 0) {
            Write-CheckResult 'VPS' $false ($vpsOutput -join ' ')
        }
        else {
            $vpsText = $vpsOutput -join "`n"
            $vpsHead = if ($vpsText -match 'HEAD=([0-9a-f]{40})') { $Matches[1] } else { '' }
            $backendOk = $vpsText -match 'BACKEND=active' -and $vpsText -match 'HEALTH=\{"ok":true'
            Write-CheckResult 'VPS e backend' ($vpsHead -eq $localHead -and $backendOk) "local=$($localHead.Substring(0, 7)) vps=$(if ($vpsHead) { $vpsHead.Substring(0, 7) } else { 'desconhecido' }) backend=$(if ($backendOk) { 'saudavel' } else { 'indisponivel' })"
        }
    }

    $changes = git status --short
    Write-Host '[INFO] Working tree:'
    if ($changes) { $changes } else { Write-Host 'limpa' }
}
finally {
    Pop-Location
}

if ($failed) {
    Write-Host "`nDiagnostico concluido com falhas. Consulte DEPLOY-RAPIDO.md."
    exit 1
}

Write-Host "`nTodos os acessos e estados principais estao sincronizados."
