import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useClerk, useSession, useSignIn, useSignUp, useUser } from '@clerk/clerk-react'
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
type SignUpResult = AuthActionResult & { needsEmailVerification?: boolean }

interface AuthContextValue {
  user: AuthUser | null
  profile: Profile | null
  session: unknown | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<AuthActionResult>
  signUp: (data: SignUpData) => Promise<SignUpResult>
  verifySignUpEmail: (code: string) => Promise<AuthActionResult>
  resendSignUpVerification: () => Promise<AuthActionResult>
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
  const { isLoaded: signUpLoaded, signUp } = useSignUp()
  const { isLoaded: userLoaded, user } = useUser()
  const { isLoaded: sessionLoaded, isSignedIn, session } = useSession()

  const [profile, setProfile] = useState<Profile | null>(null)
  const [profileLoading, setProfileLoading] = useState(true)
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false)

  const currentUser = useMemo<AuthUser | null>(() => {
    if (!user || !userLoaded || !isSignedIn) return null
    const email = user.primaryEmailAddress?.emailAddress ?? user.emailAddresses?.[0]?.emailAddress ?? null
    return { id: user.id, email }
  }, [user, userLoaded, isSignedIn])

  const loading = !signInLoaded || !signUpLoaded || !userLoaded || !sessionLoaded || (currentUser !== null && profileLoading)

  function hasRecoveryUrl() {
    const params = new URLSearchParams(window.location.search)
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    return params.get('reset_password') === '1' || params.get('type') === 'recovery' || hashParams.get('type') === 'recovery'
  }

  function clearRecoveryUrl() {
    window.history.replaceState({}, document.title, window.location.pathname)
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

    try {
      const result = await signIn.create({
        strategy: 'password',
        identifier: email,
        password,
      })

      if (result.status === 'complete' && result.createdSessionId && setActive) {
        await setActive({ session: result.createdSessionId })
        return { error: null }
      }

      return { error: 'Email ou senha inválidos. Tente novamente.' }
    } catch (error) {
      if (error instanceof Error) return { error: error.message }
      return { error: 'Falha ao efetuar login. Tente novamente.' }
    }
  }

  async function signUpWithPassword({ nome, email, password }: SignUpData) {
    if (!signUpLoaded || !signUp) {
      return { error: 'Clerk ainda está carregando. Tente novamente em alguns segundos.' }
    }

    try {
      const result = await signUp.create({
        emailAddress: email,
        password,
        firstName: nome,
        legalAccepted: true,
      })

      if (result.status === 'complete' && result.createdSessionId && setActive) {
        await setActive({ session: result.createdSessionId })
        return { error: null }
      }

      await result.prepareEmailAddressVerification({ strategy: 'email_code' })
      return { error: null, needsEmailVerification: true }
    } catch (error) {
      if (error instanceof Error) return { error: error.message }
      return { error: 'Falha ao criar conta. Tente novamente.' }
    }
  }

  async function verifySignUpEmail(code: string) {
    if (!signUpLoaded || !signUp) {
      return { error: 'Clerk ainda está carregando. Tente novamente em alguns segundos.' }
    }

    try {
      const result = await signUp.attemptEmailAddressVerification({ code })
      if (result.status === 'complete' && result.createdSessionId && setActive) {
        await setActive({ session: result.createdSessionId })
        return { error: null }
      }
      return { error: 'Não foi possível confirmar o email. Solicite um novo código e tente novamente.' }
    } catch (error) {
      if (error instanceof Error) return { error: error.message }
      return { error: 'Falha ao confirmar o email. Tente novamente.' }
    }
  }

  async function resendSignUpVerification() {
    if (!signUpLoaded || !signUp) {
      return { error: 'Clerk ainda está carregando. Tente novamente em alguns segundos.' }
    }

    try {
      await signUp.prepareEmailAddressVerification({ strategy: 'email_code' })
      return { error: null }
    } catch (error) {
      if (error instanceof Error) return { error: error.message }
      return { error: 'Falha ao reenviar o código de verificação. Tente novamente.' }
    }
  }

  async function signOut() {
    setIsPasswordRecovery(false)
    clearRecoveryUrl()
    await clerk.signOut()
  }

  async function resetPassword(email: string) {
    if (!signInLoaded || !signIn) {
      return { error: 'Clerk ainda está carregando. Tente novamente em alguns segundos.' }
    }

    try {
      await signIn.create({
        strategy: 'reset_password_email_code',
        identifier: email,
      })
      return { error: null }
    } catch (error) {
      if (error instanceof Error) return { error: error.message }
      return { error: 'Falha ao enviar o email de recuperação. Tente novamente.' }
    }
  }

  async function confirmPasswordReset(code: string, newPassword: string) {
    if (!signInLoaded || !signIn) {
      return { error: 'Clerk ainda está carregando. Tente novamente em alguns segundos.' }
    }

    try {
      const firstFactor = await signIn.attemptFirstFactor({
        strategy: 'reset_password_email_code',
        code,
      })

      if (firstFactor.status === 'needs_new_password') {
        const result = await signIn.resetPassword({ password: newPassword, signOutOfOtherSessions: false })
        if (result.status === 'complete' && result.createdSessionId && setActive) {
          await setActive({ session: result.createdSessionId })
          return { error: null }
        }
        return { error: 'Não foi possível redefinir a senha. Tente novamente.' }
      }

      if (firstFactor.status === 'complete' && firstFactor.createdSessionId && setActive) {
        await setActive({ session: firstFactor.createdSessionId })
        return { error: null }
      }

      return { error: 'Código inválido ou expirado. Solicite um novo código.' }
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
        verifySignUpEmail,
        resendSignUpVerification,
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
