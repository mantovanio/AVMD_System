export type CnpjResultado = {
  razao_social: string
  nome_fantasia: string | null
  cep: string | null
  logradouro: string | null
  numero: string | null
  complemento: string | null
  bairro: string | null
  municipio: string | null
  uf: string | null
}

export async function buscarCnpj(cnpj: string): Promise<CnpjResultado | null> {
  const digits = cnpj.replace(/\D/g, '')
  if (digits.length !== 14) return null

  try {
    const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${digits}`)
    if (!res.ok) return null
    const data = await res.json()
    if (!data?.razao_social) return null

    return {
      razao_social: String(data.razao_social ?? ''),
      nome_fantasia: data.nome_fantasia ? String(data.nome_fantasia) : null,
      cep: data.cep ? String(data.cep) : null,
      logradouro: data.logradouro ? String(data.logradouro) : null,
      numero: data.numero ? String(data.numero) : null,
      complemento: data.complemento ? String(data.complemento) : null,
      bairro: data.bairro ? String(data.bairro) : null,
      municipio: data.municipio ? String(data.municipio) : null,
      uf: data.uf ? String(data.uf) : null,
    }
  } catch {
    return null
  }
}
