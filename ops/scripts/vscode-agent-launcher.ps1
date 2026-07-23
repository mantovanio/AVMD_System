param(
  [string]$ProjectPath,
  [string]$ProjectAliasesJson = $env:TELEGRAM_PROJECT_ALIASES,
  [string]$WolTargetsJson = $env:TELEGRAM_WOL_TARGETS,
  [string]$BotToken = $env:TELEGRAM_BOT_TOKEN,
  [string]$AdminChatIds = $env:TELEGRAM_ADMIN_CHAT_IDS,
  [string]$OpenAiApiKey = $env:OPENAI_API_KEY,
  [string]$OpenAiModel = $env:OPENAI_MODEL,
  [string]$N8nWebhookUrl = $env:N8N_AGENT_WEBHOOK_URL
)

$ErrorActionPreference = 'Stop'

function Resolve-ProjectPath {
  param([string]$PathValue)
  if ([string]::IsNullOrWhiteSpace($PathValue)) {
    return (Get-Location).Path
  }
  if ([IO.Path]::IsPathRooted($PathValue)) {
    return [IO.Path]::GetFullPath($PathValue)
  }
  return [IO.Path]::GetFullPath((Join-Path (Get-Location).Path $PathValue))
}

function Read-IfMissing {
  param(
    [string]$CurrentValue,
    [string]$Prompt,
    [string]$DefaultValue = ''
  )
  if (-not [string]::IsNullOrWhiteSpace($CurrentValue)) {
    return $CurrentValue
  }
  $value = Read-Host $Prompt
  if ([string]::IsNullOrWhiteSpace($value)) { return $DefaultValue }
  return $value
}

$resolvedProjectPath = Resolve-ProjectPath -PathValue $ProjectPath
if (-not (Test-Path -LiteralPath $resolvedProjectPath)) {
  throw "Projeto não encontrado: $resolvedProjectPath"
}

$BotToken = Read-IfMissing -CurrentValue $BotToken -Prompt 'Cole o token do bot do Telegram'
$AdminChatIds = Read-IfMissing -CurrentValue $AdminChatIds -Prompt 'Cole o chat ID autorizado'
$OpenAiApiKey = Read-IfMissing -CurrentValue $OpenAiApiKey -Prompt 'Cole a OPENAI_API_KEY'
if ([string]::IsNullOrWhiteSpace($OpenAiModel)) { $OpenAiModel = 'gpt-4.1-mini' }

$env:TELEGRAM_BOT_TOKEN = $BotToken
$env:TELEGRAM_ADMIN_CHAT_IDS = $AdminChatIds
$env:TELEGRAM_AGENT_WORKSPACE = $resolvedProjectPath
$env:OPENAI_API_KEY = $OpenAiApiKey
$env:OPENAI_MODEL = $OpenAiModel

if (-not [string]::IsNullOrWhiteSpace($N8nWebhookUrl)) {
  $env:N8N_AGENT_WEBHOOK_URL = $N8nWebhookUrl
}

if (-not [string]::IsNullOrWhiteSpace($ProjectAliasesJson)) {
  $env:TELEGRAM_PROJECT_ALIASES = $ProjectAliasesJson
}

if (-not [string]::IsNullOrWhiteSpace($WolTargetsJson)) {
  $env:TELEGRAM_WOL_TARGETS = $WolTargetsJson
}

$launcherDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$agentScript = Join-Path $launcherDir 'telegram-rag-agent.ps1'
if (-not (Test-Path -LiteralPath $agentScript)) {
  throw "Agente não encontrado: $agentScript"
}

Start-Process -FilePath 'code.cmd' -ArgumentList @($resolvedProjectPath) -WindowStyle Hidden | Out-Null
Write-Host "VS Code aberto em: $resolvedProjectPath"
Write-Host "Iniciando agente..."
& $agentScript
