#!/usr/bin/env pwsh
# Git pre-commit hook (PowerShell) — redireciona qualquer commit para a fila
# Instalar: Copy-Item pending-commits/pre-commit.ps1 .git/hooks/pre-commit

# Le a mensagem direto do COMMIT_EDITMSG (pre-commit nao recebe argumentos)
$msg = ""
$gitDir = & git rev-parse --git-dir 2>$null
if ($gitDir) {
  $editMsg = Join-Path $gitDir "COMMIT_EDITMSG"
  if (Test-Path $editMsg) {
    $msg = Get-Content $editMsg | Where-Object { $_ -and $_ -notmatch '^#' } | Select-Object -First 1
  }
}

if ($msg -match '^Merge ') { exit 0 }

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

# Enfileira tudo
& git add -A
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
