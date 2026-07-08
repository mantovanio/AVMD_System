#!/usr/bin/env pwsh
param(
  [Parameter(Mandatory=$true)][string]$Message
)

$Dir = Split-Path -Parent $PSCommandPath
$Timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$Slug = $Message.ToLower() -replace '[^a-z0-9]', '-' -replace '-{2,}', '-' -replace '^-|-$', ''
if ($Slug.Length -gt 60) { $Slug = $Slug.Substring(0,60) }
$Filename = "${Timestamp}-${Slug}.patch"
$PatchPath = Join-Path $Dir $Filename

# Captura diff (staged + unstaged)
$Diff = & git diff --cached; & git diff
if (-not $Diff) {
  Write-Host "Nenhuma mudanca para enfileirar."
  exit 0
}

# Calcula hash sha256 do diff
$DiffBytes = [System.Text.Encoding]::UTF8.GetBytes($Diff)
$HashBytes = [System.Security.Cryptography.SHA256]::HashData($DiffBytes)
$Hash = -join ($HashBytes | ForEach-Object { "{0:x2}" -f $_ })
$HashLabel = "Patch-Hash: sha256:${Hash}"

# Verifica patches existentes na fila
foreach ($Existing in Get-ChildItem -Path "$Dir\*.patch" -ErrorAction SilentlyContinue) {
  $Content = Get-Content -Path $Existing.FullName -Raw -ErrorAction SilentlyContinue
  if ($Content -and $Content.Contains($HashLabel)) {
    Write-Host "IGNORADO: diff ja enfileirado em $($Existing.Name)"
    exit 0
  }
}

# Verifica se ja existe commit com o mesmo hash
$CommitCheck = & git log --oneline --grep="$HashLabel" --all --max-count=1 2>$null
if ($CommitCheck) {
  Write-Host "IGNORADO: diff ja commitado (git log --grep=`"$HashLabel`")"
  exit 0
}

# Cria o patch com hash
$Header = @"
From: pending-queue <queue@avmd.local>
Date: $(Get-Date -Format 'R')
Subject: $Message
$HashLabel
---
"@

$Header + $Diff | Out-File -FilePath $PatchPath -Encoding utf8NoBOM
Write-Host "Enfileirado: $Filename"
Write-Host "Mensagem: $Message"
Write-Host "Hash: sha256:${Hash}"
