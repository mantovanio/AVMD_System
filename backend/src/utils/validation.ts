export function onlyDigits(value: string) {
  return value.replace(/\D/g, '')
}

export function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}

export function isValidCpfCnpj(value: string) {
  const digits = onlyDigits(value)
  return digits.length === 11 || digits.length === 14
}

export function isValidCpf(value: string) {
  return onlyDigits(value).length === 11
}

export function isValidPhone(value: string) {
  return onlyDigits(value).length >= 10
}

export function isValidUf(value: string) {
  return value.trim().length === 2
}
