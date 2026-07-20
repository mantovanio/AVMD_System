import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useClerk, useSession, useSignIn, useUser } from '@clerk/clerk-react'
import { supabase } from '@/lib/supabase'
import { getApiUrl, useLegacySupabase } from '@/lib/api'
import { translatePasswordPolicyError } from '@/lib/passwordPolicy'
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

type AuthActionResult = {
  error: string | null
  nextStep?: 'second_factor'
  safeIdentifier?: string
}

interface AuthContextValue {
  user: AuthUser | null
  profile: Profile | null
  session: unknown | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<AuthActionResult>
  verifySecondFactor: (code: string) => Promise<AuthActionResult>
  resendSecondFactor: () => Promise<AuthActionResult>
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

type ClerkErrorLike = {
  errors?: Array<{ code?: string; message?: string; longMessage?: string; long_message?: string }>
  message?: string
  status?: number
}

type ClerkResetPasswordFlow = {
  resetPasswordEmailCode: {
    sendCode: () => Promise<{ error: unknown }>
    verifyCode: (params: { code: string }) => Promise<{ error: unknown }>
    submitPassword: (params: { password: string; signOutOfOtherSessions?: boolean }) => Promise<{ error: unknown }>
  }
}

function getClerkErrorMessage(error: unknown, fallback: string) {
  const payload = error as ClerkErrorLike | undefined
  const first = payload?.errors?.[0]
  const message = first?.longMessage
    ?? first?.long_message
    ?? first?.message
    ?? payload?.message
    ?? (error instanceof Error ? error.message : '')

  if (first?.code === 'form_password_incorrect' || first?.code === 'form_identifier_not_found') {
    return 'Email ou senha incorretos.'
  }

  if (first?.code === 'too_many_requests') {
    return 'Muitas tentativas. Aguarde alguns minutos e tente novamente.'
  }

  if (first?.code === 'form_code_incorrect' || first?.code === 'verification_failed') {
    return 'Código de verificação incorreto.'
  }

  if (first?.code === 'verification_expired') {
    return 'Código de verificação expirado. Solicite um novo código.'
  }

  return translatePasswordPolicyError(message || fallback)
}

function isPasswordRequirementsError(message: string) {
  const normalized = message.toLowerCase()
  return normalized.includes('requirements set for this instance')
    || normalized.includes('não atende aos requisitos')
    || normalized.includes('nao atende aos requisitos')
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const clerk = useClerk()
  const { isLoaded: signInLoaded, signIn, setActive } = useSignIn()
  const { isLoaded: userLoaded, user } = useUser()
  const { isLoaded: sessionLoaded, isSignedIn, session } = useSession()

  const [profile, setProfile] = useState<Profile | null>(null)
  const [profileLoading, setProfileLoading] = useState(true)
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false)
  const [authBootstrapReady, setAuthBootstrapReady] = useState(false)
  const signInLoadedRef = useRef(false)
  const userLoadedRef = useRef(false)
  const sessionLoadedRef = useRef(false)

  const currentUser = useMemo<AuthUser | null>(() => {
    if (!user || !userLoaded || !isSignedIn) return null
    const email = user.primaryEmailAddress?.emailAddress ?? user.emailAddresses?.[0]?.emailAddress ?? null
    return { id: user.id, email }
  }, [user, userLoaded, isSignedIn])

  const loading = (!authBootstrapReady && (!signInLoaded || !userLoaded || !sessionLoaded))
    || (currentUser !== null && profileLoading)

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

  async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> {
    let timeoutId: number | undefined
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = window.setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs)
    })

    try {
      return await Promise.race([promise, timeoutPromise])
    } finally {
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId)
      }
    }
  }

  async function activateCreatedSession(createdSessionId: string | null) {
    if (!createdSessionId) {
      return 'Autenticação concluída, mas sem sessão ativa no navegador.'
    }

    try {
      if (setActive) {
        await setActive({ session: createdSessionId })
      } else if (clerk.setActive) {
        await clerk.setActive({ session: createdSessionId })
      } else {
        return 'O navegador não conseguiu ativar a sessão autenticada.'
      }
    } catch {
      if (!clerk.setActive) {
        return 'O navegador não conseguiu ativar a sessão autenticada.'
      }
      await clerk.setActive({ session: createdSessionId })
    }

    const sessionToken = await waitForSessionToken()
    return sessionToken
      ? null
      : 'A sessão não foi confirmada no navegador. Verifique se os cookies estão liberados e tente novamente.'
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

  useEffect(() => {
    signInLoadedRef.current = signInLoaded
    userLoadedRef.current = userLoaded
    sessionLoadedRef.current = sessionLoaded
  }, [signInLoaded, userLoaded, sessionLoaded])

  useEffect(() => {
    if (signInLoaded && userLoaded && sessionLoaded) {
      setAuthBootstrapReady(true)
      return
    }

    const timeout = window.setTimeout(() => {
      setAuthBootstrapReady(true)
    }, 4000)

    return () => window.clearTimeout(timeout)
  }, [signInLoaded, userLoaded, sessionLoaded])

  async function waitForClerkBootstrap(timeoutMs = 12000) {
    const startedAt = Date.now()
    while (Date.now() - startedAt < timeoutMs) {
      if (signInLoadedRef.current && userLoadedRef.current && sessionLoadedRef.current) {
        return true
      }
      await new Promise(resolve => setTimeout(resolve, 150))
    }
    return signInLoadedRef.current && userLoadedRef.current && sessionLoadedRef.current
  }

  async function signInWithPassword(email: string, password: string): Promise<AuthActionResult> {
    const normalizedEmail = email.trim().toLowerCase()

    if (!signInLoaded || !signIn) {
      const clerkReady = await waitForClerkBootstrap()
      if (clerkReady && signIn) {
        return signInWithPassword(normalizedEmail, password)
      }
      return { error: 'Clerk ainda está carregando. Tente novamente em alguns segundos.' }
    }

    try {
      const result = await withTimeout(
        signIn.create({
          identifier: normalizedEmail,
          password,
        }),
        15000,
        'O Clerk não respondeu ao iniciar a autenticação. Verifique a conexão e tente novamente.',
      )

      if (result.status === 'complete') {
        return { error: await activateCreatedSession(result.createdSessionId) }
      }

      if (result.status === 'needs_second_factor') {
        const emailFactor = result.supportedSecondFactors?.find(factor => factor.strategy === 'email_code')
        if (!emailFactor) {
          return { error: 'Sua conta exige uma verificação adicional que este dispositivo não suporta.' }
        }

        await withTimeout(
          result.prepareSecondFactor({
            strategy: 'email_code',
            emailAddressId: emailFactor.emailAddressId,
          }),
          15000,
          'O Clerk não respondeu ao enviar o código de verificação.',
        )

        return {
          error: null,
          nextStep: 'second_factor',
          safeIdentifier: emailFactor.safeIdentifier,
        }
      }

      const nextStep = (result as { supportedFirstFactors?: Array<{ strategy?: string }> }).supportedFirstFactors?.[0]?.strategy
      return {
        error: nextStep
          ? `Não foi possível concluir a autenticação (${result.status}). Método esperado: ${nextStep}.`
          : `Não foi possível concluir a autenticação (${result.status}).`,
      }
    } catch (error) {
      return { error: getClerkErrorMessage(error, 'Falha ao efetuar login. Tente novamente.') }
    }
  }

  async function verifySecondFactor(code: string): Promise<AuthActionResult> {
    if (!signInLoaded || !signIn) {
      return { error: 'A autenticação ainda está carregando. Atualize a página e tente novamente.' }
    }

    const normalizedCode = code.replace(/\D/g, '').slice(0, 6)
    if (normalizedCode.length !== 6) {
      return { error: 'Informe o código de 6 dígitos enviado ao seu e-mail.' }
    }

    try {
      const result = await withTimeout(
        signIn.attemptSecondFactor({ strategy: 'email_code', code: normalizedCode }),
        15000,
        'O Clerk não respondeu ao validar o código de verificação.',
      )

      if (result.status !== 'complete') {
        return { error: `Não foi possível concluir a verificação (${result.status}).` }
      }

      return { error: await activateCreatedSession(result.createdSessionId) }
    } catch (error) {
      return { error: getClerkErrorMessage(error, 'Não foi possível validar o código de verificação.') }
    }
  }

  async function resendSecondFactor(): Promise<AuthActionResult> {
    if (!signInLoaded || !signIn) {
      return { error: 'A autenticação ainda está carregando. Atualize a página e tente novamente.' }
    }

    const emailFactor = signIn.supportedSecondFactors?.find(factor => factor.strategy === 'email_code')
    if (!emailFactor) {
      return { error: 'Não encontramos um e-mail válido para reenviar o código.' }
    }

    try {
      await withTimeout(
        signIn.prepareSecondFactor({
          strategy: 'email_code',
          emailAddressId: emailFactor.emailAddressId,
        }),
        15000,
        'O Clerk não respondeu ao reenviar o código de verificação.',
      )
      return {
        error: null,
        nextStep: 'second_factor',
        safeIdentifier: emailFactor.safeIdentifier,
      }
    } catch (error) {
      return { error: getClerkErrorMessage(error, 'Não foi possível reenviar o código de verificação.') }
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
    const normalizedEmail = email.trim().toLowerCase()

    try {
      const recoverySignIn = signIn as typeof signIn & ClerkResetPasswordFlow
      const response = await fetch(getApiUrl('/auth/password-recovery/request'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: normalizedEmail }),
      })
      const data = await response.json().catch(() => null) as { ok?: boolean; error?: string; email?: string } | null
      if (!response.ok || !data?.ok) {
        return { error: data?.error ?? 'Falha ao preparar a recuperação no Clerk.' }
      }

      if (!signInLoaded || !signIn) {
        const clerkReady = await waitForClerkBootstrap()
        if (clerkReady && signIn) {
          return resetPassword(normalizedEmail)
        }
        return { error: 'Clerk ainda está carregando. Tente novamente em alguns segundos.' }
      }

      let createErrorMessage: string | null = null
      try {
        const createResult = await withTimeout(
          signIn.create({ identifier: normalizedEmail }),
          15000,
          'O Clerk não respondeu ao iniciar a recuperação.',
        )
        const createResultError = (createResult as { error?: unknown }).error
        createErrorMessage = createResultError
          ? getClerkErrorMessage(createResultError, '')
          : null
      } catch (error) {
        const message = getClerkErrorMessage(error, '')
        if (!isPasswordRequirementsError(message)) {
          throw error
        }
        createErrorMessage = message
        console.warn('[AuthContext] Clerk retornou politica de senha ao iniciar recuperacao; seguindo para envio do codigo.')
      }

      const sendCodeResult = await withTimeout(
        recoverySignIn.resetPasswordEmailCode.sendCode(),
        15000,
        'O Clerk não respondeu ao enviar o código de recuperação.',
      )

      if (sendCodeResult.error) {
        const sendCodeError = getClerkErrorMessage(sendCodeResult.error, 'Falha ao enviar o código de recuperação.')
        return {
          error: isPasswordRequirementsError(sendCodeError)
            ? 'Não foi possível iniciar a recuperação agora. Verifique o e-mail cadastrado e tente novamente.'
            : sendCodeError,
        }
      }

      if (createErrorMessage && !isPasswordRequirementsError(createErrorMessage)) {
        // O fluxo foi iniciado com sucesso; o erro do create não deve interromper a recuperação.
        console.warn('[AuthContext] createResult retornou aviso no fluxo de recuperação:', createErrorMessage)
      }

      return { error: `Código enviado para ${data.email ?? normalizedEmail}.` }
    } catch (error) {
      const message = getClerkErrorMessage(error, 'Falha ao enviar o código de recuperação. Tente novamente.')
      return {
        error: isPasswordRequirementsError(message)
          ? 'Não foi possível iniciar a recuperação agora. Verifique o e-mail cadastrado e tente novamente.'
          : message,
      }
    }
  }

  async function confirmPasswordReset(code: string, newPassword: string) {
    try {
      const recoverySignIn = signIn as typeof signIn & ClerkResetPasswordFlow
      if (!signInLoaded || !signIn) {
        const clerkReady = await waitForClerkBootstrap()
        if (clerkReady && signIn) {
          return confirmPasswordReset(code, newPassword)
        }
        return { error: 'Clerk ainda está carregando. Tente novamente em alguns segundos.' }
      }

      const normalizedCode = code.replace(/\D/g, '').slice(0, 6)
      if (normalizedCode.length !== 6) {
        return { error: 'Informe o código de 6 dígitos enviado ao seu e-mail.' }
      }

      const verifyResult = await withTimeout(
        recoverySignIn.resetPasswordEmailCode.verifyCode({ code: normalizedCode }),
        15000,
        'O Clerk não respondeu ao validar o código de recuperação.',
      )

      if (verifyResult.error) {
        return { error: getClerkErrorMessage(verifyResult.error, 'Código inválido ou expirado. Solicite um novo código.') }
      }

      const submitResult = await withTimeout(
        recoverySignIn.resetPasswordEmailCode.submitPassword({
          password: newPassword,
          signOutOfOtherSessions: true,
        }),
        15000,
        'O Clerk não respondeu ao atualizar a senha.',
      )

      if (submitResult.error) {
        return { error: getClerkErrorMessage(submitResult.error, 'Falha ao atualizar a senha. Tente novamente.') }
      }

      return { error: null }
    } catch (error) {
      return { error: getClerkErrorMessage(error, 'Falha ao verificar o código. Tente novamente.') }
    }
  }

  async function updatePassword(password: string) {
    if (!signInLoaded || !signIn) {
      const clerkReady = await waitForClerkBootstrap()
      if (clerkReady && signIn) {
        return updatePassword(password)
      }
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
      return { error: getClerkErrorMessage(error, 'Falha ao atualizar a senha. Tente novamente.') }
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
        verifySecondFactor,
        resendSecondFactor,
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
