param(
  [string]$ClerkSecretKey = $env:CLERK_SECRET_KEY
)

if (-not $ClerkSecretKey) {
  Write-Error "CLERK_SECRET_KEY not set. Provide via param or env var."
  exit 1
}

$headers = @{
  Authorization = "Bearer $ClerkSecretKey"
  "Content-Type" = "application/json"
}

$apiBase = "https://api.clerk.com/v1/templates/email"

# ───── Reset Password Code ─────
Write-Host "Updating reset_password_code..." -ForegroundColor Cyan

$resetPasswordMarkup = @'
<re-html>
<re-head>
    <re-title>
        {{otp_code}} é o seu código de redefinição de senha
    </re-title>
</re-head>
<re-body background-color="#fff" padding="48px 32px 48px 32px">
    <re-preheader>
        Seu código de redefinição de senha {{app.name}}
    </re-preheader>
    <re-header padding="16px 32px 8px 32px">
        <re-text font-size="18px" font-weight="bold" line-height="26px" color="#111827">
            {{> app_logo}}
        </re-text>
    </re-header>
    <re-main background-color="#fff" border-radius="0px">
        <re-block border-radius="0px" align="left" padding="32px 32px 48px 32px" background-color="#ffffff" font-size="14px" font-weight="bold" margin="0" level="h1">
            <re-heading margin="0" level="h1" align="left" color="#111827" font-size="24px" line-height="32px">
                Código de redefinição de senha
            </re-heading>
            <re-text margin="32px 0px 0px 0px" align="left" font-size="14px" color="#747686">
                Digite o seguinte código quando solicitado:
            </re-text>
            <re-text font-size="40px" margin="16px 0px 0px 0px" color="#747686">
                <b>{{otp_code}}</b>
            </re-text>
            <re-text margin="16px 0px 0px 0px" font-size="14px" color="#747686">
                Para proteger sua conta, não compartilhe este código.
            </re-text>
            <re-text margin="64px 0px 0px 0px" color="#747686" font-size="14px">
                <b>Não solicitou isto?</b>
            </re-text>
            <re-text font-size="14px" margin="4px 0px 0px 0px" color="#747686">
                Este código foi solicitado de <b>{{requested_from}}</b> às <b>{{requested_at}}</b>. Se você não fez esta solicitação, ignore este e-mail.
            </re-text>
        </re-block>
    </re-main>
    <re-footer padding="24px 32px 48px">
        <re-divider background-color="#B7B8C2" height="1px"></re-divider>
        <re-text margin="16px 0px 0px 0px" font-size="13px" color="#747686">&copy; {{current_year}} {{app.name}}</re-text>
    </re-footer>
</re-body>
</re-html>
'@

# Get the current body to extract the HTML wrapper structure, then inject our Portuguese text
$currentReset = Invoke-RestMethod -Uri "$apiBase/reset_password_code" -Headers $headers -Method Get

# Build new HTML body based on current structure with Portuguese text
$resetPasswordBody = $currentReset.body -replace
  '{{otp_code}} is your {{app\.name}} reset password code',
  '{{otp_code}} é o seu código de redefinição de senha {{app.name}}' -replace
  'Your {{app\.name}} reset password code',
  'Seu código de redefinição de senha {{app.name}}' -replace
  'Reset password code',
  'Código de redefinição de senha' -replace
  'Enter the following code when prompted:',
  'Digite o seguinte código quando solicitado:' -replace
  'To protect your account, do not share this code\.',
  'Para proteger sua conta, não compartilhe este código.' -replace
  "Didn't request this\?",
  'Não solicitou isto?' -replace
  'This code was requested from.*?If you didn''t make this request, you can safely ignore this email\.',
  'Este código foi solicitado de <b>{{requested_from}}</b> às <b>{{requested_at}}</b>. Se você não fez esta solicitação, ignore este e-mail.'

# But regex replacement is fragile. Let's build the body from scratch instead.
$resetPasswordBody = $currentReset.body -replace '(?s)<title>.*?</title>', "<title>{{otp_code}} é o seu código de redefinição de senha</title>"
$resetPasswordBody = $resetPasswordBody -replace '(?s)<span style="color: transparent; display: none; height: 0px; max-height: 0px; max-width: 0px; opacity: 0; overflow: hidden; visibility: hidden; width: 0px;">.*?</span>', '<span style="color: transparent; display: none; height: 0px; max-height: 0px; max-width: 0px; opacity: 0; overflow: hidden; visibility: hidden; width: 0px;">Seu código de redefinição de senha {{app.name}}</span>'
$resetPasswordBody = $resetPasswordBody -replace '(?s)<h1[^>]*>.*?</h1>', '<h1 class="h1" align="left" style="padding: 0px; margin: 0px; font-style: normal; font-family: Helvetica, Arial, sans-serif; font-size: 24px; line-height: 32px; color: #111827; font-weight: 700;"> Código de redefinição de senha </h1>'
$resetPasswordBody = $resetPasswordBody -replace '(?s)Enter the following code when prompted:', 'Digite o seguinte código quando solicitado:'
$resetPasswordBody = $resetPasswordBody -replace '(?s)To protect your account, do not share this code\.', 'Para proteger sua conta, não compartilhe este código.'
$resetPasswordBody = $resetPasswordBody -replace "(?s)Didn't request this\?", 'Não solicitou isto?'
$resetPasswordBody = $resetPasswordBody -replace '(?s)This code was requested from.*?If you didn''t make this request, you can safely ignore this email\.', 'Este código foi solicitado de <b>{{requested_from}}</b> às <b>{{requested_at}}</b>. Se você não fez esta solicitação, ignore este e-mail.'

$resetBodyPayload = @{
  name    = 'Código de redefinição de senha'
  subject = '{{otp_code}} é o seu código de redefinição de senha'
  markup  = $resetPasswordMarkup
  body    = $resetPasswordBody
} | ConvertTo-Json

try {
  $r = Invoke-RestMethod -Uri "$apiBase/reset_password_code" -Headers $headers -Method Put -Body $resetBodyPayload -ErrorAction Stop
  Write-Host "  OK: $($r.subject)" -ForegroundColor Green
} catch {
  Write-Host "  ERROR: $_" -ForegroundColor Red
  $err = $_.Exception.Response.GetResponseStream()
  $reader = New-Object System.IO.StreamReader($err)
  Write-Host "  Response: $($reader.ReadToEnd())" -ForegroundColor Red
}

# ───── Verification Code ─────
Write-Host "Updating verification_code..." -ForegroundColor Cyan

$verifyMarkup = @'
<re-html>
<re-head>
    <re-title>
        {{otp_code}} é o seu código de verificação
    </re-title>
</re-head>
<re-body background-color="#fff" padding="48px 32px 48px 32px">
    <re-preheader>
        Seu código de verificação {{app.name}}
    </re-preheader>
    <re-header padding="16px 32px 8px 32px">
        <re-text font-size="18px" font-weight="bold" line-height="26px" color="#111827">
            {{> app_logo}}
        </re-text>
    </re-header>
    <re-main background-color="#fff" border-radius="0px">
        <re-block border-radius="0px" align="left" padding="32px 32px 48px 32px" background-color="#ffffff" font-size="14px" font-weight="bold" margin="0" level="h1">
            <re-heading margin="0" level="h1" align="left" color="#111827" font-size="24px" line-height="32px">
                Código de verificação
            </re-heading>
            <re-text margin="32px 0px 0px 0px" align="left" font-size="14px" color="#747686">
                Digite o seguinte código quando solicitado:
            </re-text>
            <re-text font-size="40px" margin="16px 0px 0px 0px" color="#747686">
                <b>{{otp_code}}</b>
            </re-text>
            <re-text margin="16px 0px 0px 0px" font-size="14px" color="#747686">
                Para proteger sua conta, não compartilhe este código.
            </re-text>
            <re-text margin="64px 0px 0px 0px" color="#747686" font-size="14px">
                <b>Não solicitou isto?</b>
            </re-text>
            <re-text font-size="14px" margin="4px 0px 0px 0px" color="#747686">
                Este código foi solicitado de <b>{{requested_from}}</b> às <b>{{requested_at}}</b>. Se você não fez esta solicitação, ignore este e-mail.
            </re-text>
        </re-block>
    </re-main>
    <re-footer padding="24px 32px 48px">
        <re-divider background-color="#B7B8C2" height="1px"></re-divider>
        <re-text margin="16px 0px 0px 0px" font-size="13px" color="#747686">&copy; {{current_year}} {{app.name}}</re-text>
    </re-footer>
</re-body>
</re-html>
'@

$currentVerify = Invoke-RestMethod -Uri "$apiBase/verification_code" -Headers $headers -Method Get

$verifyBody = $currentVerify.body -replace '(?s)<title>.*?</title>', "<title>{{otp_code}} é o seu código de verificação</title>"
$verifyBody = $verifyBody -replace '(?s)<span style="color: transparent; display: none; height: 0px; max-height: 0px; max-width: 0px; opacity: 0; overflow: hidden; visibility: hidden; width: 0px;">.*?</span>', '<span style="color: transparent; display: none; height: 0px; max-height: 0px; max-width: 0px; opacity: 0; overflow: hidden; visibility: hidden; width: 0px;">Seu código de verificação {{app.name}}</span>'
$verifyBody = $verifyBody -replace '(?s)<h1[^>]*>.*?</h1>', '<h1 class="h1" align="left" style="padding: 0px; margin: 0px; font-style: normal; font-family: Helvetica, Arial, sans-serif; font-size: 24px; line-height: 32px; color: #111827; font-weight: 700;"> Código de verificação </h1>'
$verifyBody = $verifyBody -replace '(?s)Enter the following verification code when prompted:', 'Digite o seguinte código quando solicitado:'
$verifyBody = $verifyBody -replace '(?s)To protect your account, do not share this code\.', 'Para proteger sua conta, não compartilhe este código.'
$verifyBody = $verifyBody -replace "(?s)Didn't request this\?", 'Não solicitou isto?'
$verifyBody = $verifyBody -replace '(?s)This code was requested from.*?If you didn''t make this request, you can safely ignore this email\.', 'Este código foi solicitado de <b>{{requested_from}}</b> às <b>{{requested_at}}</b>. Se você não fez esta solicitação, ignore este e-mail.'

$verifyBodyPayload = @{
  name    = 'Código de verificação'
  subject = '{{otp_code}} é o seu código de verificação'
  markup  = $verifyMarkup
  body    = $verifyBody
} | ConvertTo-Json

try {
  $r = Invoke-RestMethod -Uri "$apiBase/verification_code" -Headers $headers -Method Put -Body $verifyBodyPayload -ErrorAction Stop
  Write-Host "  OK: $($r.subject)" -ForegroundColor Green
} catch {
  Write-Host "  ERROR: $_" -ForegroundColor Red
  $err = $_.Exception.Response.GetResponseStream()
  $reader = New-Object System.IO.StreamReader($err)
  Write-Host "  Response: $($reader.ReadToEnd())" -ForegroundColor Red
}

Write-Host "`nDone!" -ForegroundColor Green
