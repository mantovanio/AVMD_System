param(
  [string]$BotToken = $env:TELEGRAM_BOT_TOKEN,
  [string]$AdminChatIds = $env:TELEGRAM_ADMIN_CHAT_IDS,
  [string]$WorkspacePath = $env:TELEGRAM_AGENT_WORKSPACE,
  [string]$ProjectAliasesJson = $env:TELEGRAM_PROJECT_ALIASES,
  [string]$WolTargetsJson = $env:TELEGRAM_WOL_TARGETS,
  [string]$OpenAiApiKey = $env:OPENAI_API_KEY,
  [string]$OpenAiModel = $env:OPENAI_MODEL,
  [string]$N8nWebhookUrl = $env:N8N_AGENT_WEBHOOK_URL
)

$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($BotToken)) {
  $BotToken = Read-Host 'Cole o token do bot (BotFather)'
}

if ([string]::IsNullOrWhiteSpace($AdminChatIds)) {
  $AdminChatIds = Read-Host 'Cole o chat ID autorizado'
}

if ([string]::IsNullOrWhiteSpace($WorkspacePath)) {
  $WorkspacePath = 'C:\projetos\AVMD_System'
}

if ([string]::IsNullOrWhiteSpace($OpenAiApiKey)) {
  $OpenAiApiKey = Read-Host 'Cole a OPENAI_API_KEY'
}

if ([string]::IsNullOrWhiteSpace($OpenAiModel)) {
  $OpenAiModel = 'gpt-4.1-mini'
}

$env:TELEGRAM_BOT_TOKEN = $BotToken
$env:TELEGRAM_ADMIN_CHAT_IDS = $AdminChatIds
$env:TELEGRAM_AGENT_WORKSPACE = $WorkspacePath
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

node "C:\projetos\AVMD_System\ops\scripts\telegram-rag-agent.mjs"
