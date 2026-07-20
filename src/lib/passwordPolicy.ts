export function validateStrongPassword(value: string) {
  const password = value.trim()
  if (password.length < 8) return 'Use pelo menos 8 caracteres.'
  if (!/[A-Z]/.test(password)) return 'Inclua pelo menos 1 letra maiúscula.'
  if (!/[a-z]/.test(password)) return 'Inclua pelo menos 1 letra minúscula.'
  if (!/\d/.test(password)) return 'Inclua pelo menos 1 número.'
  return null
}

export function translatePasswordPolicyError(message: string) {
  const normalized = message.toLowerCase()

  if (normalized.includes('invalid login credentials')) return 'Email ou senha incorretos.'
  if (normalized.includes("couldn't find your account") || normalized.includes('account does not exist') || normalized.includes('no account')) {
    return 'Conta não encontrada. Verifique o email ou crie uma conta.'
  }
  if (normalized.includes('signup is disabled')) return 'Novos cadastros estão desabilitados. Contate o administrador.'
  if (normalized.includes('rate limit') || normalized.includes('too many requests') || normalized.includes('too many')) {
    return 'Muitas tentativas. Aguarde alguns minutos e tente novamente.'
  }
  if (normalized.includes('failed to fetch') || normalized.includes('network')) {
    return 'Falha de conexão com o servidor de autenticação. Atualize a página e tente novamente.'
  }
  if (normalized.includes('auth session missing')) {
    return 'Sessão de recuperação expirada. Solicite um novo link.'
  }
  if (normalized.includes('new password should be different')) {
    return 'A nova senha precisa ser diferente da senha atual.'
  }
  if (normalized.includes('data doesn\'t match user requirements set for this instance')) {
    return 'A senha informada não atende aos requisitos de segurança desta conta.'
  }
  if (normalized.includes('doesn\'t match user requirements set for this instance')) {
    return 'A senha informada não atende aos requisitos de segurança desta conta.'
  }
  if (normalized.includes('password should be at least') || normalized.includes('passwords must be 8 characters or more')) {
    return 'A senha deve ter pelo menos 8 caracteres.'
  }
  if (normalized.includes('password must contain') || normalized.includes('password should contain') || normalized.includes('password needs to contain')) {
    if (normalized.includes('uppercase')) return 'Inclua pelo menos 1 letra maiúscula.'
    if (normalized.includes('lowercase')) return 'Inclua pelo menos 1 letra minúscula.'
    if (normalized.includes('digit') || normalized.includes('number')) return 'Inclua pelo menos 1 número.'
  }
  if (normalized.includes('password_found_in_breach') || normalized.includes('found in a list') || normalized.includes('data breach') || normalized.includes('pwned')) {
    return 'Esta senha foi encontrada em vazamentos de dados. Por segurança, escolha uma senha diferente.'
  }
  return message
}
