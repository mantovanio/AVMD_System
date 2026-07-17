import { useEffect, useState } from 'react'
import { Shield, Eye, EyeOff, ArrowLeft, CheckCircle, Loader2 } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { DEFAULT_AGENCY_CONFIG, buildAuthBackground, fetchAgencyConfig } from '@/lib/agencyConfig'

type View = 'login' | 'register' | 'forgot'

function translateError(msg: string): string {
  const normalized = msg.toLowerCase()
  if (normalized.includes('invalid login credentials')) return 'Email ou senha incorretos.'
  if (msg.includes('Email not confirmed'))            return 'Sua conta ainda não está pronta para acesso. Tente entrar novamente em alguns instantes.'
  if (msg.includes('User already registered'))        return 'Este email já está cadastrado.'
  if (msg.includes('Password should be at least') || msg.includes('Passwords must be 8 characters or more'))
                                                      return 'A senha deve ter pelo menos 8 caracteres.'
  if (msg.includes('signup is disabled'))             return 'Novos cadastros estão desabilitados. Contate o administrador.'
  if (msg.includes('rate limit'))                     return 'Muitas tentativas. Aguarde alguns minutos e tente novamente.'
  if (msg.includes('Failed to fetch'))                return 'Falha de conexão com o servidor de autenticação. Atualize a página e tente novamente.'
  if (msg.includes('A sessão não foi confirmada no navegador')) return 'O navegador não confirmou a sessão. Verifique cookies bloqueados, modo privado ou use outro navegador.'
  if (msg.includes('Autenticação concluída, mas sem sessão ativa no navegador')) return 'O login foi concluído, mas o navegador não manteve a sessão. Verifique cookies e privacidade.'
  if (msg.includes('Não foi possível concluir a autenticação')) return 'Não foi possível concluir o login. Tente novamente.'
  if (msg.includes('Código enviado para')) return msg
  if (msg.includes('Código inválido ou expirado')) return 'Código inválido ou expirado. Solicite um novo código.'
  if (normalized.includes("couldn't find your account")) return 'Conta não encontrada. Verifique o email ou crie uma conta.'
  if (msg.includes('already exists') || msg.includes('já está cadastrado')) return 'Este email já está cadastrado.'
  if (msg.includes('data breach') || msg.includes('pwned') || msg.includes('online data breach'))
                                                      return 'Esta senha foi encontrada em vazamentos de dados. Por segurança, escolha uma senha diferente.'
  if (msg.includes('password_found_in_breach') || msg.includes('found in a list')) return 'Esta senha foi encontrada em vazamentos de dados. Por segurança, escolha uma senha diferente.'
  if (normalized.includes('is incorrect') || normalized.includes('password is incorrect')) return 'Email ou senha incorretos.'
  if (normalized.includes('account does not exist') || normalized.includes('no account')) return 'Conta não encontrada. Verifique o email ou crie uma conta.'
  if (normalized.includes('too many requests') || normalized.includes('too many')) return 'Muitas tentativas. Aguarde alguns minutos e tente novamente.'
  if (normalized.includes('network')) return 'Erro de conexão. Verifique sua internet e tente novamente.'
  return msg
}

function InputField({
  label,
  type = 'text',
  value,
  onChange,
  placeholder,
  autoFocus,
  required = true,
  inputMode,
  autoComplete,
  maxLength,
}: {
  label: string
  type?: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  autoFocus?: boolean
  required?: boolean
  inputMode?: 'text' | 'numeric' | 'email' | 'tel'
  autoComplete?: string
  maxLength?: number
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-white/90 mb-1 text-center">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        required={required}
        inputMode={inputMode}
        autoComplete={autoComplete}
        maxLength={maxLength}
        className="w-full border border-white/30 rounded-xl px-4 py-3 text-sm
          bg-white/10 text-white placeholder:text-white/60
          focus:outline-none focus:ring-2 focus:ring-white/70 transition-shadow"
      />
    </div>
  )
}

function PasswordInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  const [show, setShow] = useState(false)
  return (
    <div>
      {label ? <label className="block text-xs font-medium text-white/90 mb-1 text-center">{label}</label> : null}
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder ?? '••••••••'}
          required
          className="w-full border border-white/30 rounded-xl px-4 py-3 pr-10 text-sm
            bg-white/10 text-white placeholder:text-white/60
            focus:outline-none focus:ring-2 focus:ring-white/70 transition-shadow"
        />
        <button
          type="button"
          onClick={() => setShow(s => !s)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-white/70 hover:text-white transition-colors"
          tabIndex={-1}
        >
          {show ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
    </div>
  )
}

function ErrorBox({ msg }: { msg: string }) {
  return (
    <div className="flex items-start gap-2 p-3 bg-red-500/20 border border-red-300/60 rounded-xl text-sm text-white">
      <span className="shrink-0 mt-0.5">⚠</span>
      <span>{msg}</span>
    </div>
  )
}

function SubmitButton({
  loading,
  label,
  loadingLabel,
  primaryColor,
}: {
  loading: boolean
  label: string
  loadingLabel: string
  primaryColor: string
}) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="w-full disabled:opacity-60
        text-white font-semibold rounded-xl py-3 text-sm transition-colors
        flex items-center justify-center gap-2"
      style={{ backgroundColor: primaryColor }}
    >
      {loading ? (
        <>
          <Loader2 size={16} className="animate-spin" />
          {loadingLabel}
        </>
      ) : label}
    </button>
  )
}

export default function Login() {
  const { signIn, verifySecondFactor, resendSecondFactor, signUp, resetPassword, confirmPasswordReset } = useAuth()
  const [view, setView] = useState<View>('login')
  const [agencyConfig, setAgencyConfig] = useState(DEFAULT_AGENCY_CONFIG)

  const [loginEmail, setLoginEmail] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)
  const [loginError, setLoginError] = useState<string | null>(null)
  const [loginStep, setLoginStep] = useState<'credentials' | 'second_factor'>('credentials')
  const [secondFactorCode, setSecondFactorCode] = useState('')
  const [secondFactorTarget, setSecondFactorTarget] = useState('')
  const [secondFactorInfo, setSecondFactorInfo] = useState<string | null>(null)

  const [regNome, setRegNome] = useState('')
  const [regEmail, setRegEmail] = useState('')
  const [regPass, setRegPass] = useState('')
  const [regConfirm, setRegConfirm] = useState('')
  const [regConsent, setRegConsent] = useState(false)
  const [regLoading, setRegLoading] = useState(false)
  const [regError, setRegError] = useState<string | null>(null)
  const [regOk, setRegOk] = useState(false)

  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotLoading, setForgotLoading] = useState(false)
  const [forgotError, setForgotError] = useState<string | null>(null)
  const [forgotOk, setForgotOk] = useState(false)
  const [forgotCode, setForgotCode] = useState('')
  const [forgotNewPass, setForgotNewPass] = useState('')
  const [forgotNewConfirm, setForgotNewConfirm] = useState('')
  const [forgotResetLoading, setForgotResetLoading] = useState(false)
  const [forgotResetError, setForgotResetError] = useState<string | null>(null)
  const [forgotDone, setForgotDone] = useState(false)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoginError(null)
    setLoginLoading(true)
    try {
      const result = await signIn(loginEmail, loginPassword)
      if (result.error) {
        setLoginError(translateError(result.error))
      } else if (result.nextStep === 'second_factor') {
        setSecondFactorTarget(result.safeIdentifier ?? loginEmail)
        setSecondFactorCode('')
        setSecondFactorInfo('Código de segurança enviado. Verifique sua caixa de entrada e o spam.')
        setLoginStep('second_factor')
      }
    } catch (error) {
      setLoginError(translateError(error instanceof Error ? error.message : 'Falha ao efetuar login. Tente novamente.'))
    } finally {
      setLoginLoading(false)
    }
  }

  async function handleSecondFactor(e: React.FormEvent) {
    e.preventDefault()
    setLoginError(null)
    setSecondFactorInfo(null)
    setLoginLoading(true)
    try {
      const { error } = await verifySecondFactor(secondFactorCode)
      if (error) setLoginError(translateError(error))
    } catch (error) {
      setLoginError(translateError(error instanceof Error ? error.message : 'Falha ao validar o código. Tente novamente.'))
    } finally {
      setLoginLoading(false)
    }
  }

  async function handleResendSecondFactor() {
    setLoginError(null)
    setSecondFactorInfo(null)
    setLoginLoading(true)
    try {
      const result = await resendSecondFactor()
      if (result.error) {
        setLoginError(translateError(result.error))
      } else {
        setSecondFactorTarget(result.safeIdentifier ?? secondFactorTarget)
        setSecondFactorInfo('Novo código enviado. Utilize apenas o código mais recente.')
      }
    } catch (error) {
      setLoginError(translateError(error instanceof Error ? error.message : 'Falha ao reenviar o código. Tente novamente.'))
    } finally {
      setLoginLoading(false)
    }
  }

  function returnToCredentials() {
    setLoginStep('credentials')
    setSecondFactorCode('')
    setSecondFactorInfo(null)
    setLoginError(null)
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault()
    setRegError(null)
    if (regPass !== regConfirm) { setRegError('As senhas não coincidem.'); return }
    if (regPass.length < 8) { setRegError('A senha deve ter pelo menos 8 caracteres.'); return }
    if (!regConsent) { setRegError('Você precisa aceitar a Política de Privacidade para criar uma conta.'); return }
    setRegLoading(true)
    const { error } = await signUp({ nome: regNome, email: regEmail, password: regPass })
    if (error) setRegError(translateError(error))
    else setRegOk(true)
    setRegLoading(false)
  }

  async function handleForgot(e: React.FormEvent) {
    e.preventDefault()
    setForgotError(null)
    setForgotLoading(true)
    const { error } = await resetPassword(forgotEmail)
    if (error) {
      if (error.startsWith('Código enviado para')) {
        setForgotOk(true)
        setForgotError(null)
      } else {
        setForgotError(translateError(error))
      }
    } else {
      setForgotOk(true)
    }
    setForgotLoading(false)
  }

  async function handleForgotReset(e: React.FormEvent) {
    e.preventDefault()
    setForgotResetError(null)
    if (forgotNewPass !== forgotNewConfirm) { setForgotResetError('As senhas não coincidem.'); return }
    if (forgotNewPass.length < 8) { setForgotResetError('A senha deve ter pelo menos 8 caracteres.'); return }
    setForgotResetLoading(true)
    const { error } = await confirmPasswordReset(forgotCode.trim(), forgotNewPass)
    if (error) setForgotResetError(translateError(error))
    else setForgotDone(true)
    setForgotResetLoading(false)
  }

  function goLogin() {
    setLoginError(null)
    setLoginStep('credentials')
    setSecondFactorCode('')
    setSecondFactorTarget('')
    setSecondFactorInfo(null)
    setRegError(null)
    setRegOk(false)
    setForgotError(null)
    setForgotOk(false)
    setForgotCode('')
    setForgotNewPass('')
    setForgotNewConfirm('')
    setForgotResetError(null)
    setForgotDone(false)
    setView('login')
  }

  useEffect(() => {
    let active = true

    async function loadAgencyConfig() {
      const { data } = await fetchAgencyConfig()
      if (active) setAgencyConfig(data)
    }

    void loadAgencyConfig()
    return () => { active = false }
  }, [])

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4 sm:p-6"
      style={{ background: buildAuthBackground(agencyConfig.fundo_inicio, agencyConfig.fundo_fim) }}
    >
      <div className="w-full max-w-md text-center">
        <div className="text-center mb-5 px-8">
          {agencyConfig.logo_login_url.trim() ? (
            <div className="relative w-full h-24 sm:h-28 mb-3 overflow-visible">
              <div
                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[78%] h-[78%] rounded-full blur-2xl"
                style={{ backgroundColor: `${agencyConfig.cor_primaria}55` }}
              />
              <img
                src={agencyConfig.logo_login_url}
                alt={agencyConfig.login_titulo}
                className="relative z-10 w-full h-full object-contain object-center"
                style={{ filter: 'brightness(0) invert(1)' }}
              />
            </div>
          ) : (
            <div
              className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4 shadow-lg"
              style={{ backgroundColor: agencyConfig.cor_primaria, boxShadow: `0 18px 40px ${agencyConfig.cor_primaria}66` }}
            >
              <Shield size={28} className="text-white" />
            </div>
          )}
          <p className="text-white/80 text-sm mt-1">{agencyConfig.login_subtitulo}</p>
        </div>

        <div className="bg-black/30 border border-white/20 rounded-2xl shadow-2xl shadow-black/40 backdrop-blur-md overflow-hidden text-white">
          {view === 'login' && (
            <div className="p-8">
              {loginStep === 'credentials' ? (
                <>
                  <h2 className="text-xl font-bold text-white mb-1">Bem-vindo!</h2>
                  <p className="text-sm text-white/80 mb-6">Entre com sua conta para acessar o sistema</p>

                  <form onSubmit={handleLogin} className="space-y-4">
                    <InputField label="Email" type="email" value={loginEmail} onChange={setLoginEmail} placeholder="seu@email.com" autoFocus autoComplete="username" />

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium text-white/90">Senha</span>
                        <button type="button" onClick={() => { setLoginError(null); setView('forgot') }} className="text-xs text-white/90 hover:underline">
                          Esqueci minha senha
                        </button>
                      </div>
                      <PasswordInput label="" value={loginPassword} onChange={setLoginPassword} />
                    </div>

                    {loginError && <ErrorBox msg={loginError} />}

                    <SubmitButton loading={loginLoading} label="Entrar" loadingLabel="Validando..." primaryColor={agencyConfig.cor_primaria} />
                  </form>

                  <div className="mt-6 pt-6 border-t border-white/15 text-center">
                    <p className="text-sm text-white/80">
                      Não tem conta?{' '}
                      <button type="button" onClick={() => { setLoginError(null); setView('register') }} className="text-white font-semibold hover:underline">
                        Criar conta
                      </button>
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={returnToCredentials}
                    className="flex items-center gap-1.5 text-sm text-white/85 hover:text-white mb-5 -ml-1 transition-colors mx-auto"
                  >
                    <ArrowLeft size={15} /> Voltar ao login
                  </button>

                  <h2 className="text-xl font-bold text-white mb-1">Confirme que é você</h2>
                  <p className="text-sm text-white/80 mb-6">
                    Enviamos um código de segurança para <strong>{secondFactorTarget || loginEmail}</strong>.
                  </p>

                  <form onSubmit={handleSecondFactor} className="space-y-4">
                    <InputField
                      label="Código de 6 dígitos"
                      type="text"
                      value={secondFactorCode}
                      onChange={value => setSecondFactorCode(value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="000000"
                      autoFocus
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                    />

                    {secondFactorInfo && (
                      <div className="p-3 bg-blue-500/20 border border-blue-300/50 rounded-xl text-sm text-white">
                        {secondFactorInfo}
                      </div>
                    )}
                    {loginError && <ErrorBox msg={loginError} />}

                    <SubmitButton loading={loginLoading} label="Validar e entrar" loadingLabel="Validando código..." primaryColor={agencyConfig.cor_primaria} />

                    <button
                      type="button"
                      onClick={() => void handleResendSecondFactor()}
                      disabled={loginLoading}
                      className="w-full text-xs text-white/70 hover:text-white disabled:opacity-50 transition-colors"
                    >
                      Não recebeu? Reenviar código
                    </button>
                  </form>
                </>
              )}
            </div>
          )}

          {view === 'register' && (
            <div className="p-8">
              <button type="button" onClick={goLogin} className="flex items-center gap-1.5 text-sm text-white/85 hover:text-white mb-5 -ml-1 transition-colors mx-auto">
                <ArrowLeft size={15} /> Voltar ao login
              </button>

              <h2 className="text-xl font-bold text-white mb-1">Criar conta</h2>
              <p className="text-sm text-white/80 mb-6">Preencha os dados para solicitar acesso ao sistema</p>

              {regOk ? (
                <div className="text-center py-6 space-y-4">
                  <div className="w-14 h-14 rounded-full bg-green-500/20 border border-green-300/50 flex items-center justify-center mx-auto">
                    <CheckCircle size={28} className="text-white" />
                  </div>
                  <div>
                    <p className="font-semibold text-white text-lg">Conta criada!</p>
                    <p className="text-sm text-white/80 mt-2">
                      Recebemos seu cadastro para <strong>{regEmail}</strong>.<br />
                      Enviamos um e-mail informando que o acesso está aguardando aprovação da equipe.
                    </p>
                  </div>
                  <button type="button" onClick={goLogin} className="text-sm text-white hover:underline font-medium">
                    Voltar ao login
                  </button>
                </div>
              ) : (
                <form onSubmit={handleRegister} className="space-y-4">
                  <InputField label="Nome completo" value={regNome} onChange={setRegNome} placeholder="Seu nome completo" />
                  <InputField label="Email" type="email" value={regEmail} onChange={setRegEmail} placeholder="seu@email.com" />

                  <div className="grid grid-cols-2 gap-3">
                    <PasswordInput label="Senha" value={regPass} onChange={setRegPass} placeholder="Mín. 8 caracteres" />
                    <PasswordInput label="Confirmar senha" value={regConfirm} onChange={setRegConfirm} />
                  </div>

                  <p className="text-xs text-white/85 bg-white/10 border border-white/20 rounded-xl px-3 py-2 text-center">
                    O tipo de acesso será definido pelo administrador em Configurações.
                  </p>

                  <label className="flex items-start gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={regConsent}
                      onChange={e => setRegConsent(e.target.checked)}
                      className="mt-0.5 shrink-0 accent-current"
                      required
                    />
                    <span className="text-xs text-white/90">
                      Li e aceito a{' '}
                      <a href="/privacidade" target="_blank" rel="noopener noreferrer" className="underline hover:text-white">
                        Política de Privacidade
                      </a>
                      {' '}e autorizo o tratamento dos meus dados pessoais conforme a LGPD (Lei 13.709/2018).
                    </span>
                  </label>

                  {regError && <ErrorBox msg={regError} />}

                  <SubmitButton loading={regLoading} label="Criar conta" loadingLabel="Criando..." primaryColor={agencyConfig.cor_primaria} />
                </form>
              )}
            </div>
          )}

          {view === 'forgot' && (
            <div className="p-8">
              <button type="button" onClick={goLogin} className="flex items-center gap-1.5 text-sm text-white/85 hover:text-white mb-5 -ml-1 transition-colors mx-auto">
                <ArrowLeft size={15} /> Voltar ao login
              </button>

              <h2 className="text-xl font-bold text-white mb-1">Recuperar senha</h2>
              <p className="text-sm text-white/80 mb-6">Informe seu email e enviaremos um código interno para redefinir sua senha.</p>

              {forgotDone ? (
                <div className="text-center py-6 space-y-4">
                  <div className="w-14 h-14 rounded-full bg-green-500/20 border border-green-300/50 flex items-center justify-center mx-auto">
                    <CheckCircle size={28} className="text-white" />
                  </div>
                  <div>
                    <p className="font-semibold text-white text-lg">Senha redefinida!</p>
                    <p className="text-sm text-white/80 mt-2">Sua senha foi atualizada. Você já está conectado.</p>
                  </div>
                  <button type="button" onClick={goLogin} className="text-sm text-white hover:underline font-medium">
                    Ir para o sistema
                  </button>
                </div>
              ) : forgotOk ? (
                <form onSubmit={handleForgotReset} className="space-y-4">
                  <div className="text-center pb-2">
                    <p className="text-sm text-white/80">
                      Enviamos um código para <strong>{forgotEmail}</strong>.<br />
                      Digite o código recebido e defina sua nova senha.
                    </p>
                  </div>

                  <InputField label="Código recebido no email" type="text" value={forgotCode} onChange={setForgotCode} placeholder="000000" autoFocus />
                  <PasswordInput label="Nova senha" value={forgotNewPass} onChange={setForgotNewPass} placeholder="Mínimo 8 caracteres" />
                  <PasswordInput label="Confirmar nova senha" value={forgotNewConfirm} onChange={setForgotNewConfirm} />

                  {forgotResetError && <ErrorBox msg={forgotResetError} />}

                  <SubmitButton loading={forgotResetLoading} label="Redefinir senha" loadingLabel="Verificando..." primaryColor={agencyConfig.cor_primaria} />

                  <button type="button" onClick={() => { setForgotOk(false); setForgotError(null) }} className="w-full text-xs text-white/60 hover:text-white/90 text-center mt-1">
                    Não recebeu o código? Reenviar
                  </button>
                </form>
              ) : (
                <form onSubmit={handleForgot} className="space-y-4">
                  <InputField label="Email cadastrado" type="email" value={forgotEmail} onChange={setForgotEmail} placeholder="seu@email.com" autoFocus />

                  {forgotError && <ErrorBox msg={forgotError} />}

                  <SubmitButton loading={forgotLoading} label="Enviar código de recuperação" loadingLabel="Enviando..." primaryColor={agencyConfig.cor_primaria} />
                </form>
              )}
            </div>
          )}
        </div>

        <p className="text-center text-white/60 text-xs mt-6">© 2026 {agencyConfig.nome_agencia}</p>
      </div>
    </div>
  )
}
