// Mantenha esta função idêntica a backend/src/utils/phone.ts — não há
// como compartilhar o módulo entre os dois builds (frontend e backend
// são projetos TypeScript separados, sem cross-import hoje).
//
// Normaliza um telefone brasileiro para a forma canônica DDD+número
// (10 ou 11 dígitos, sem o DDI "55"). Essa é a chave usada para decidir
// "é o mesmo contato" em todo o sistema de chat — nunca usar o telefone
// cru ou parcialmente normalizado para comparar identidade.
export function normalizePhoneBR(value: string | null | undefined): string | null {
  const digits = String(value ?? '').replace(/\D/g, '')
  if (!digits) return null

  const withoutDDI = (digits.length === 12 || digits.length === 13) && digits.startsWith('55')
    ? digits.slice(2)
    : digits

  if (withoutDDI.length === 10 || withoutDDI.length === 11) return withoutDDI
  return null
}
