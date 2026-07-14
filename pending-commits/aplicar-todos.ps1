#!/usr/bin/env pwsh
param(
  [switch]$DryRun
)

$Dir = Split-Path -Parent $PSCommandPath
$Patches = Get-ChildItem -Path "$Dir\*.patch" -ErrorAction SilentlyContinue | Sort-Object Name

if ($Patches.Count -eq 0) {
  Write-Host "Nenhum patch pendente."
  exit 0
}

Write-Host "Encontrados $($Patches.Count) patch(s) pendentes."

foreach ($Patch in $Patches) {
  $Basename = $Patch.Name
  $Content = Get-Content -Path $Patch.FullName -Raw

  # Extrai Subject e Hash do cabecalho
  $Subject = ""
  $HashLine = ""
  foreach ($Line in ($Content -split "`n")) {
    if ($Line -match '^Subject: (.+)$') { $Subject = $Matches[1] }
    if ($Line -match '^Patch-Hash: ')   { $HashLine = $Line.Trim() }
  }
  if (-not $Subject) { $Subject = $Basename }

  Write-Host "`n=== Aplicando: $Basename ==="
  Write-Host "Mensagem: $Subject"
  if ($HashLine) { Write-Host $HashLine }

  # Verifica se o hash ja foi commitado (seguranca extra)
  if ($HashLine) {
    $CommitCheck = & git log --oneline --grep="$HashLine" --all --max-count=1 2>$null
    if ($CommitCheck) {
      Write-Host "  JA COMMITADO — pulando e removendo patch."
      Remove-Item -Path $Patch.FullName -Force
      continue
    }
  }

  if ($DryRun) {
    & git apply --stat $Patch.FullName
    Write-Host "  (dry-run - nao aplicado)"
  } else {
    & git apply $Patch.FullName
    & git add -A
    $BuildMsg = $Subject
    if ($HashLine) {
      $BuildMsg = "$BuildMsg`n`n$HashLine"
    }
    $env:PENDING_QUEUE_APPLY = "1"
    & git commit -m $BuildMsg
    Remove-Item Env:\PENDING_QUEUE_APPLY -ErrorAction SilentlyContinue
    Remove-Item -Path $Patch.FullName -Force
    Write-Host "  Aplicado e commitado. Patch removido da fila."
  }
}

Write-Host "`nFila processada."
