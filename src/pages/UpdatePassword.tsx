import { useEffect, useState } from 'react'
import { CheckCircle, Eye, EyeOff, KeyRound, Loader2, Shield } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { DEFAULT_AGENCY_CONFIG, buildAuthBackground, fetchAgencyConfig } from '@/lib/agencyConfig'
import { translatePasswordPolicyError, validateStrongPassword } from '@/lib/passwordPolicy'

function PasswordInput({
  label,
  value,
  onChange,
  autoFocus,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  autoFocus?: boolean
}) {
  const [show, setShow] = useState(false)

  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{label}</label>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={e => onChange(e.target.value)}
          autoFocus={autoFocus}
          required
          placeholder="Mínimo 8 caracteres"
          className="w-full border border-gray-300 dark:border-gray-700 rounded-xl px-4 py-3 pr-10 text-sm
            bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100
            focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow"
        />
        <button
          type="button"
          onClick={() => setShow(s => !s)}
          title={show ? 'Ocultar senha' : 'Mostrar senha'}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
        >
          {show ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
    </div>
  )
}

export default function UpdatePassword() {
  const { updatePassword, signOut, finishPasswordRecovery } = useAuth()
  const [agencyConfig, setAgencyConfig] = useState(DEFAULT_AGENCY_CONFIG)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    let active = true

    async function loadAgencyConfig() {
      const { data } = await fetchAgencyConfig()
      if (active) setAgencyConfig(data)
    }

    void loadAgencyConfig()
    return () => { active = false }
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const passwordError = validateStrongPassword(password)
    if (passwordError) {
      setError(passwordError)
      return
    }

    if (password !== confirm) {
      setError('As senhas não coincidem.')
      return
    }

    setLoading(true)
    const { error } = await updatePassword(password)
    setLoading(false)

    if (error) {
      setError(translatePasswordPolicyError(error))
      return
    }

    setDone(true)
  }

  function enterSystem() {
    finishPasswordRecovery()
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: buildAuthBackground(agencyConfig.fundo_inicio, agencyConfig.fundo_fim) }}
    >
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          {agencyConfig.logo_login_url.trim() ? (
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-white/10 backdrop-blur-sm mb-4 shadow-lg p-3">
              <img src={agencyConfig.logo_login_url} alt={agencyConfig.login_titulo} className="w-full h-full object-contain" />
            </div>
          ) : (
            <div
              className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4 shadow-lg"
              style={{ backgroundColor: agencyConfig.cor_primaria, boxShadow: `0 18px 40px ${agencyConfig.cor_primaria}66` }}
            >
              <Shield size={28} className="text-white" />
            </div>
          )}
          <h1 className="text-2xl font-bold text-white tracking-tight">{agencyConfig.nome_agencia}</h1>
          <p className="text-white/80 text-sm mt-1">Redefinição de senha</p>
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl shadow-black/40 overflow-hidden p-8">
          {done ? (
            <div className="text-center py-4 space-y-4">
              <div className="w-14 h-14 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto">
                <CheckCircle size={28} className="text-green-600 dark:text-green-400" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">Senha atualizada!</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                  Sua nova senha já está ativa para os próximos acessos.
                </p>
              </div>
                <button
                  type="button"
                  onClick={enterSystem}
                  className="w-full text-white font-semibold rounded-xl py-3 text-sm transition-colors"
                  style={{ backgroundColor: agencyConfig.cor_primaria }}
                >
                  Entrar no sistema
                </button>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                  <KeyRound size={20} className="text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white">Crie uma nova senha</h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Informe e confirme sua nova senha.</p>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <PasswordInput label="Nova senha" value={password} onChange={setPassword} autoFocus />
                <PasswordInput label="Confirmar nova senha" value={confirm} onChange={setConfirm} />

                {error && (
                  <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-sm text-red-600 dark:text-red-400">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full disabled:opacity-60
                    text-white font-semibold rounded-xl py-3 text-sm transition-colors
                    flex items-center justify-center gap-2"
                  style={{ backgroundColor: agencyConfig.cor_primaria }}
                >
                  {loading ? <><Loader2 size={16} className="animate-spin" /> Salvando...</> : 'Salvar nova senha'}
                </button>

                <button
                  type="button"
                  onClick={signOut}
                  className="w-full text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                >
                  Cancelar e voltar ao login
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
