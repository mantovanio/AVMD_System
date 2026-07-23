param(
  [string]$BotToken = $env:TELEGRAM_BOT_TOKEN,
  [string]$AdminChatIds = $env:TELEGRAM_ADMIN_CHAT_IDS,
  [string]$WorkspacePath = $env:TELEGRAM_AGENT_WORKSPACE,
  [string]$StatePath = $env:TELEGRAM_AGENT_STATE_PATH,
  [int]$PollTimeoutSeconds = 25
)

$ErrorActionPreference = 'Stop'

function Get-DefaultWorkspacePath {
  $candidate = (Get-Location).Path
  if (Test-Path -LiteralPath (Join-Path $candidate '.git')) { return $candidate }
  return $env:USERPROFILE
}

function Get-DefaultStatePath {
  $base = Join-Path $env:LOCALAPPDATA 'AVMD\telegram-agent'
  if (-not (Test-Path -LiteralPath $base)) {
    New-Item -ItemType Directory -Path $base -Force | Out-Null
  }
  return (Join-Path $base 'state.json')
}

function Normalize-ChatIds {
  param([string]$Value)
  if ([string]::IsNullOrWhiteSpace($Value)) { return @() }
  return $Value.Split(',') | ForEach-Object { $_.Trim() } | Where-Object { $_ }
}

function Escape-JsonString {
  param([string]$Text)
  if ($null -eq $Text) { return '' }
  return ($Text -replace '\\', '\\\\' -replace '"', '\"' -replace "`r", '' -replace "`n", '\n')
}

function Send-TelegramMessage {
  param(
    [string]$Token,
    [string]$ChatId,
    [string]$Text
  )

  $uri = "https://api.telegram.org/bot$Token/sendMessage"
  $body = @{
    chat_id = $ChatId
    text = $Text
    disable_web_page_preview = $true
  } | ConvertTo-Json -Depth 6

  Invoke-RestMethod -Method Post -Uri $uri -ContentType 'application/json' -Body $body | Out-Null
}

function Get-TelegramUpdates {
  param(
    [string]$Token,
    [long]$Offset,
    [int]$TimeoutSeconds
  )

  $uri = "https://api.telegram.org/bot$Token/getUpdates?timeout=$TimeoutSeconds&offset=$Offset&allowed_updates=%5B%22message%22%5D"
  try {
    return Invoke-RestMethod -Method Get -Uri $uri
  } catch {
    return $null
  }
}

function Save-State {
  param([hashtable]$State, [string]$Path)
  $json = $State | ConvertTo-Json -Depth 10
  Set-Content -LiteralPath $Path -Value $json -Encoding UTF8
}

function Load-State {
  param([string]$Path)
  if (-not (Test-Path -LiteralPath $Path)) {
    return @{
      offset = 0
      pending = @{}
    }
  }

  try {
    $raw = Get-Content -LiteralPath $Path -Raw -Encoding UTF8 | ConvertFrom-Json
    $pending = @{}
    if ($raw.pending) {
      foreach ($key in $raw.pending.PSObject.Properties.Name) {
        $pending[$key] = $raw.pending.$key
      }
    }
    $rawOffset = 0
    if ($raw.PSObject.Properties.Name -contains 'offset' -and $null -ne $raw.offset) {
      $rawOffset = [long]$raw.offset
    }
    return @{
      offset = $rawOffset
      pending = $pending
    }
  } catch {
    return @{
      offset = 0
      pending = @{}
    }
  }
}

function New-CommandId {
  return ([guid]::NewGuid().ToString('N').Substring(0, 8))
}

function Get-CommandSafety {
  param([string]$CommandText)

  $dangerPatterns = @(
    '(^|[\s;])(Remove-Item|del|erase|rd|rmdir|format|Stop-Process|Restart-Computer|Shutdown|Set-ExecutionPolicy)\b',
    '(^|[\s;])(Move-Item|Copy-Item|Rename-Item|Set-Item|Clear-Item|New-Item)\b',
    '(^|[\s;])(reg\s+delete|reg\s+add|bcdedit|diskpart|cipher)\b',
    '(^|[\s;])(git\s+reset|git\s+clean|git\s+rebase|git\s+push\s+--force)\b'
  )

  foreach ($pattern in $dangerPatterns) {
    if ($CommandText -match $pattern) { return 'confirm' }
  }

  if ($CommandText.Length -gt 220) { return 'confirm' }
  return 'allow'
}

function Invoke-LocalCommand {
  param(
    [string]$CommandText,
    [string]$Workspace
  )

  Push-Location $Workspace
  try {
    $result = & powershell.exe -NoProfile -ExecutionPolicy Bypass -Command $CommandText 2>&1
    $exitCode = $LASTEXITCODE
    $output = ($result | Out-String).Trim()
    return @{
      exitCode = $exitCode
      output = if ($output) { $output } else { '(sem saída)' }
    }
  } finally {
    Pop-Location
  }
}

if ([string]::IsNullOrWhiteSpace($BotToken)) {
  $BotToken = Read-Host 'Cole o token do bot (BotFather)'
}

$adminIds = Normalize-ChatIds $AdminChatIds
if ($adminIds.Count -eq 0) {
  $adminIds = @(Read-Host 'Cole o chat ID autorizado')
  if ([string]::IsNullOrWhiteSpace($adminIds[0])) {
    throw 'TELEGRAM_ADMIN_CHAT_IDS não configurado.'
  }
}

if ([string]::IsNullOrWhiteSpace($WorkspacePath)) {
  $WorkspacePath = Get-DefaultWorkspacePath
}

if ([string]::IsNullOrWhiteSpace($StatePath)) {
  $StatePath = Get-DefaultStatePath
}

if (-not (Test-Path -LiteralPath $WorkspacePath)) {
  throw "WorkspacePath inválido: $WorkspacePath"
}

$state = Load-State -Path $StatePath
$offset = 0
if ($state.PSObject.Properties.Name -contains 'offset' -and $null -ne $state.offset) {
  $offset = [long]$state.offset
}
if (-not $state.pending) {
  $state.pending = @{}
}

Write-Host "Telegram ops agent iniciado"
Write-Host "Workspace: $WorkspacePath"
Write-Host "Estado: $StatePath"

while ($true) {
  $updates = Get-TelegramUpdates -Token $BotToken -Offset $offset -TimeoutSeconds $PollTimeoutSeconds
  if ($null -eq $updates -or -not $updates.ok) { Start-Sleep -Seconds 2; continue }

  foreach ($update in $updates.result) {
    $offset = [long]$update.update_id + 1
    $message = $update.message
    if ($null -eq $message -or [string]::IsNullOrWhiteSpace($message.text)) { continue }

    $chatId = [string]$message.chat.id
    if ($adminIds -notcontains $chatId) { continue }

    $text = $message.text.Trim()
    $parts = $text.Split(' ', 2, [System.StringSplitOptions]::RemoveEmptyEntries)
    $command = $parts[0].ToLowerInvariant()
    $args = if ($parts.Count -gt 1) { $parts[1].Trim() } else { '' }

    switch -Regex ($command) {
      '^/(start|help|ajuda)$' {
        Send-TelegramMessage -Token $BotToken -ChatId $chatId -Text @"
Comandos:
/status
/pwd
/ls [pasta]
/cat <arquivo>
/run <comando PowerShell>
/ok <id>
/cancel <id>

Observação:
Comandos sensíveis exigem confirmação.
"@
        continue
      }

      '^/status$' {
        $status = @(
          'Agente local ativo',
          "Computador: $env:COMPUTERNAME",
          "Usuário: $env:USERNAME",
          "Workspace: $WorkspacePath"
        ) -join "`n"
        Send-TelegramMessage -Token $BotToken -ChatId $chatId -Text $status
        continue
      }

      '^/pwd$' {
        Send-TelegramMessage -Token $BotToken -ChatId $chatId -Text (Get-Location).Path
        continue
      }

      '^/ls$' {
        $target = if ($args) {
          if ([IO.Path]::IsPathRooted($args)) { $args } else { Join-Path $WorkspacePath $args }
        } else {
          $WorkspacePath
        }
        if (-not (Test-Path -LiteralPath $target)) {
          Send-TelegramMessage -Token $BotToken -ChatId $chatId -Text "Pasta não encontrada: $target"
          continue
        }
        $items = Get-ChildItem -LiteralPath $target | Select-Object -First 40 | ForEach-Object {
          if ($_.PSIsContainer) { "[DIR] $($_.Name)" } else { "[ARQ] $($_.Name)" }
        }
        $listing = $items -join "`n"
        if ([string]::IsNullOrWhiteSpace($listing)) { $listing = '(vazio)' }
        Send-TelegramMessage -Token $BotToken -ChatId $chatId -Text $listing
        continue
      }

      '^/cat$' {
        if (-not $args) {
          Send-TelegramMessage -Token $BotToken -ChatId $chatId -Text 'Use: /cat caminho\arquivo.txt'
          continue
        }
        $target = if ([IO.Path]::IsPathRooted($args)) { $args } else { Join-Path $WorkspacePath $args }
        if (-not (Test-Path -LiteralPath $target)) {
          Send-TelegramMessage -Token $BotToken -ChatId $chatId -Text "Arquivo não encontrado: $target"
          continue
        }
        $content = Get-Content -LiteralPath $target -Raw -ErrorAction Stop
        if ($content.Length -gt 3500) { $content = $content.Substring(0, 3500) + "`n...[cortado]" }
        Send-TelegramMessage -Token $BotToken -ChatId $chatId -Text $content
        continue
      }

      '^/run$' {
        if (-not $args) {
          Send-TelegramMessage -Token $BotToken -ChatId $chatId -Text 'Use: /run Get-ChildItem ou /run npm run build'
          continue
        }

        $commandText = $args
        $safety = Get-CommandSafety -CommandText $commandText
        $id = New-CommandId
        $state.pending[$id] = @{
          chatId = $chatId
          command = $commandText
          createdAt = (Get-Date).ToString('o')
        }
        Save-State -State $state -Path $StatePath

        if ($safety -eq 'confirm') {
          Send-TelegramMessage -Token $BotToken -ChatId $chatId -Text "Comando pendente de confirmação. Use /ok $id para executar.`n`n$commandText"
          continue
        }

        $exec = Invoke-LocalCommand -CommandText $commandText -Workspace $WorkspacePath
        $output = "ExitCode: $($exec.exitCode)`n$($exec.output)"
        Send-TelegramMessage -Token $BotToken -ChatId $chatId -Text $output
        $state.pending.Remove($id) | Out-Null
        Save-State -State $state -Path $StatePath
        continue
      }

      '^/ok$' {
        if (-not $args) {
          Send-TelegramMessage -Token $BotToken -ChatId $chatId -Text 'Use: /ok <id>'
          continue
        }
        $id = $args.Split(' ', 2)[0]
        if (-not $state.pending.ContainsKey($id)) {
          Send-TelegramMessage -Token $BotToken -ChatId $chatId -Text "Comando pendente não encontrado: $id"
          continue
        }
        $pending = $state.pending[$id]
        if ([string]$pending.chatId -ne $chatId) {
          Send-TelegramMessage -Token $BotToken -ChatId $chatId -Text 'Você não pode confirmar este comando.'
          continue
        }
        $exec = Invoke-LocalCommand -CommandText ([string]$pending.command) -Workspace $WorkspacePath
        $output = "ExitCode: $($exec.exitCode)`n$($exec.output)"
        Send-TelegramMessage -Token $BotToken -ChatId $chatId -Text $output
        $state.pending.Remove($id) | Out-Null
        Save-State -State $state -Path $StatePath
        continue
      }

      '^/cancel$' {
        if (-not $args) {
          Send-TelegramMessage -Token $BotToken -ChatId $chatId -Text 'Use: /cancel <id>'
          continue
        }
        $id = $args.Split(' ', 2)[0]
        if ($state.pending.ContainsKey($id)) {
          $state.pending.Remove($id) | Out-Null
          Save-State -State $state -Path $StatePath
          Send-TelegramMessage -Token $BotToken -ChatId $chatId -Text "Cancelado: $id"
        } else {
          Send-TelegramMessage -Token $BotToken -ChatId $chatId -Text "Comando pendente não encontrado: $id"
        }
        continue
      }

      default {
        Send-TelegramMessage -Token $BotToken -ChatId $chatId -Text 'Comando não reconhecido. Use /help.'
        continue
      }
    }
  }

  Save-State -State $state -Path $StatePath
  Start-Sleep -Milliseconds 1200
}
