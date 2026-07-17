import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useClerk, useSession, useSignIn, useUser } from '@clerk/clerk-react'
import { supabase } from '@/lib/supabase'
import { getApiUrl, useLegacySupabase } from '@/lib/api'
import type { Profile } from '@/types'

export interface SignUpData {
  nome: string
  email: string
  password: string
}

interface AuthUser {
  id: string
  email: string | null
}

type AuthActionResult = { error: string | null }

interface AuthContextValue {
  user: AuthUser | null
  profile: Profile | null
  session: unknown | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<AuthActionResult>
  signUp: (data: SignUpData) => Promise<AuthActionResult>
  signOut: () => Promise<void>
  resetPassword: (email: string) => Promise<AuthActionResult>
  confirmPasswordReset: (code: string, newPassword: string) => Promise<AuthActionResult>
  updatePassword: (password: string) => Promise<AuthActionResult>
  isPasswordRecovery: boolean
  finishPasswordRecovery: () => void
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const clerk = useClerk()
  const { isLoaded: signInLoaded, signIn, setActive } = useSignIn()
  const { isLoaded: userLoaded, user } = useUser()
  const { isLoaded: sessionLoaded, isSignedIn, session } = useSession()

  const [profile, setProfile] = useState<Profile | null>(null)
  const [profileLoading, setProfileLoading] = useState(true)
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false)
  const [authTransitioning, setAuthTransitioning] = useState(false)

  const currentUser = useMemo<AuthUser | null>(() => {
    if (!user || !userLoaded || !isSignedIn) return null
    const email = user.primaryEmailAddress?.emailAddress ?? user.emailAddresses?.[0]?.emailAddress ?? null
    return { id: user.id, email }
  }, [user, userLoaded, isSignedIn])

  const loading = !signInLoaded || !userLoaded || !sessionLoaded || authTransitioning || (currentUser !== null && profileLoading)

  function hasRecoveryUrl() {
    const params = new URLSearchParams(window.location.search)
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    return params.get('reset_password') === '1' || params.get('type') === 'recovery' || hashParams.get('type') === 'recovery'
  }

  function clearRecoveryUrl() {
    window.history.replaceState({}, document.title, window.location.pathname)
  }

  async function waitForSessionToken(timeoutMs = 2500) {
    const startedAt = Date.now()
    while (Date.now() - startedAt < timeoutMs) {
      const token = await clerk.session?.getToken().catch(() => null)
      if (token) return token
      await new Promise(resolve => setTimeout(resolve, 150))
    }
    return null
  }

  async function loadProfile(userId: string, email?: string) {
    setProfileLoading(true)
    try {
      if (useLegacySupabase()) {
        let result = await supabase.from('profiles').select('*').eq('id', userId).single()
        if (!result.data && email) {
          result = await supabase.from('profiles').select('*').eq('email', email).single()
        }
        setProfile(result.data ?? null)
      } else {
        const response = await fetch(getApiUrl('/auth/profile'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, email }),
        })
        const data = await response.json().catch(() => null) as { ok: boolean; profile: Profile | null } | null
        setProfile(data?.profile ?? null)
      }
    } catch {
      setProfile(null)
    }
    setProfileLoading(false)
  }

  async function refreshProfile() {
    if (currentUser) await loadProfile(currentUser.id, currentUser.email ?? undefined)
  }

  useEffect(() => {
    if (currentUser) {
      void loadProfile(currentUser.id, currentUser.email ?? undefined)
    } else {
      setProfile(null)
      setProfileLoading(false)
    }
  }, [currentUser?.id, currentUser?.email])

  useEffect(() => {
    if (hasRecoveryUrl()) {
      setIsPasswordRecovery(true)
    }
  }, [])

  async function signInWithPassword(email: string, password: string) {
    if (!signInLoaded || !signIn) {
      return { error: 'Clerk ainda está carregando. Tente novamente em alguns segundos.' }
    }

    setAuthTransitioning(true)
    try {
      const result = await signIn.create({
        strategy: 'password',
        identifier: email,
        password,
      })

      if (result.status === 'complete' && result.createdSessionId && setActive) {
        try {
          await setActive({ session: result.createdSessionId })
        } catch {
          await clerk.setActive?.({ session: result.createdSessionId })
        }
        const sessionToken = await waitForSessionToken()
        if (!sessionToken) {
          return { error: 'A sessão não foi confirmada no navegador. Verifique se os cookies estão liberados e tente novamente.' }
        }
        return { error: null }
      }

      if (result.status === 'complete' && result.createdSessionId && clerk.setActive) {
        await clerk.setActive({ session: result.createdSessionId })
        const sessionToken = await waitForSessionToken()
        if (!sessionToken) {
          return { error: 'A sessão não foi confirmada no navegador. Verifique se os cookies estão liberados e tente novamente.' }
        }
        return { error: null }
      }

      if (result.status !== 'complete') {
        return { error: `Não foi possível concluir a autenticação (${result.status}).` }
      }

      return { error: 'Autenticação concluída, mas sem sessão ativa no navegador.' }
    } catch (error) {
      if (error instanceof Error) return { error: error.message }
      return { error: 'Falha ao efetuar login. Tente novamente.' }
    } finally {
      setAuthTransitioning(false)
    }
  }

  async function signUpWithPassword({ nome, email, password }: SignUpData) {
    try {
      const response = await fetch(getApiUrl('/auth/register'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome, email, senha: password }),
      })
      const data = await response.json().catch(() => null) as { ok?: boolean; error?: string } | null
      if (!response.ok || !data?.ok) {
        return { error: data?.error ?? 'Não foi possível concluir o cadastro agora.' }
      }
      return { error: null }
    } catch (error) {
      if (error instanceof Error) return { error: error.message }
      return { error: 'Falha ao criar conta. Tente novamente.' }
    }
  }

  async function signOut() {
    setIsPasswordRecovery(false)
    clearRecoveryUrl()
    await clerk.signOut()
  }

  async function resetPassword(email: string) {
    try {
      const response = await fetch(getApiUrl('/auth/password-recovery/request'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = await response.json().catch(() => null) as { ok?: boolean; error?: string; email?: string } | null
      if (!response.ok || !data?.ok) {
        return { error: data?.error ?? 'Falha ao enviar o código de recuperação.' }
      }
      return { error: `Código enviado para ${data.email ?? email}.` }
    } catch (error) {
      if (error instanceof Error) return { error: error.message }
      return { error: 'Falha ao enviar o email de recuperação. Tente novamente.' }
    }
  }

  async function confirmPasswordReset(code: string, newPassword: string) {
    try {
      const response = await fetch(getApiUrl('/auth/password-recovery/verify'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: code, password: newPassword }),
      })
      const data = await response.json().catch(() => null) as { ok?: boolean; error?: string } | null
      if (!response.ok || !data?.ok) {
        return { error: data?.error ?? 'Código inválido ou expirado. Solicite um novo código.' }
      }
      return { error: null }
    } catch (error) {
      if (error instanceof Error) return { error: error.message }
      return { error: 'Falha ao verificar o código. Tente novamente.' }
    }
  }

  async function updatePassword(password: string) {
    if (!signInLoaded || !signIn) {
      return { error: 'Clerk ainda está carregando. Tente novamente em alguns segundos.' }
    }

    try {
      if (user) {
        await user.updatePassword({ newPassword: password })
        return { error: null }
      }

      const result = await signIn.resetPassword({ password, signOutOfOtherSessions: false })
      if (result.status === 'complete') {
        return { error: null }
      }

      return { error: 'Não foi possível atualizar a senha. Tente novamente.' }
    } catch (error) {
      if (error instanceof Error) return { error: error.message }
      return { error: String(error) }
    }
  }

  function finishPasswordRecovery() {
    setIsPasswordRecovery(false)
    clearRecoveryUrl()
  }

  return (
    <AuthContext.Provider
      value={{
        user: currentUser,
        profile,
        session: session ?? null,
        loading,
        signIn: signInWithPassword,
        signUp: signUpWithPassword,
        signOut,
        resetPassword,
        confirmPasswordReset,
        updatePassword,
        isPasswordRecovery,
        finishPasswordRecovery,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth deve ser usado dentro de AuthProvider')
  return ctx
}
