import type { AivenSqlClient } from '../db/aivenClient.js'

export type ResolvedCadastroBase = {
  id: string
  nome: string | null
  email: string | null
  telefone: string | null
  cpf_cnpj: string | null
}

function onlyDigits(value: string | null | undefined) {
  const digits = String(value ?? '').replace(/\D/g, '')
  return digits || null
}

function normalizeText(value: string | null | undefined) {
  const text = String(value ?? '').trim()
  return text || null
}

export async function resolveCadastroBaseByIdentity(
  db: AivenSqlClient,
  input: {
    phone?: string | null
    email?: string | null
    cpf?: string | null
    cnpj?: string | null
    document?: string | null
  },
): Promise<ResolvedCadastroBase | null> {
  const phoneDigits = onlyDigits(input.phone)
  const cleanEmail = normalizeText(input.email)
  const cleanCpf = onlyDigits(input.cpf)
  const cleanCnpj = onlyDigits(input.cnpj)
  const cleanDocument = onlyDigits(input.document)
  const normalizedDoc = cleanDocument ?? cleanCpf ?? cleanCnpj

  if (!phoneDigits && !cleanEmail && !normalizedDoc) return null

  const result = await db.query<ResolvedCadastroBase>(
    `select
       id::text as id,
       nome,
       email,
       telefone,
       cpf_cnpj
     from cadastros_base
     where ($1::text is not null and regexp_replace(coalesce(cpf_cnpj, ''), '\D', '', 'g') = $1)
        or ($2::text is not null and right(regexp_replace(coalesce(telefone, ''), '\D', '', 'g'), 11) = right($2, 11))
        or ($3::text is not null and lower(coalesce(email, '')) = lower($3))
     order by
       case
         when $1::text is not null and regexp_replace(coalesce(cpf_cnpj, ''), '\D', '', 'g') = $1 then 1
         when $2::text is not null and right(regexp_replace(coalesce(telefone, ''), '\D', '', 'g'), 11) = right($2, 11) then 2
         when $3::text is not null and lower(coalesce(email, '')) = lower($3) then 3
         else 99
       end,
       updated_at desc nulls last,
       created_at desc nulls last
     limit 1`,
    [normalizedDoc, phoneDigits, cleanEmail],
  )

  return result.rows[0] ?? null
}
