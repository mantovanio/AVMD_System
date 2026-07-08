#!/usr/bin/env pwsh
# Git commit-msg hook (PowerShell) — redireciona qualquer commit para a fila
# Instalar: Copy-Item pending-commits/commit-msg.ps1 .git/hooks/commit-msg

$CommitMsgFile = $args[0]
$msg = ""

# Le a primeira linha nao-comentario
if ($CommitMsgFile -and (Test-Path $CommitMsgFile)) {
  $msg = Get-Content $CommitMsgFile | Where-Object { $_ -and $_ -notmatch '^#' } | Select-Object -First 1
}

# Permite merges
if ($msg -match '^Merge ') { exit 0 }

# Permite commits do proprio sistema de fila
if ($env:PENDING_QUEUE_APPLY) { exit 0 }

# Nada staged
$staged = & git diff --cached
if (-not $staged) { exit 0 }

$RepoRoot = & git rev-parse --show-toplevel
$Enfileirar = Join-Path $RepoRoot "pending-commits" "enfileirar.ps1"
if (-not (Test-Path $Enfileirar)) {
  Write-Host "AVISO: enfileirar.ps1 nao encontrado. Commit permitido."
  exit 0
}

if (-not $msg) { $msg = "commit via IDE sem mensagem" }

# Enfileira tudo, exceto pending-commits/
& git add -A
& git reset HEAD -- pending-commits/ 2>$null
& $Enfileirar $msg

# Limpa working tree (preserva pending-commits/)
& git reset --mixed HEAD -- . 2>$null
& git checkout HEAD -- . 2>$null
& git clean -fd --exclude=pending-commits/ 2>$null

Write-Host ""
Write-Host "╔══════════════════════════════════════════════════════╗"
Write-Host "║  Commit redirecionado para pending-commits/         ║"
Write-Host "║                                                     ║"
Write-Host "║  Para efetivar todos os patches pendentes:          ║"
Write-Host "║    pwsh -File pending-commits/aplicar-todos.ps1     ║"
Write-Host "║                                                     ║"
Write-Host "║  Para ver a fila:                                   ║"
Write-Host "║    ls pending-commits/*.patch                       ║"
Write-Host "╚══════════════════════════════════════════════════════╝"

exit 1
