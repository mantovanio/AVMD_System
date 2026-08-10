import pg from 'pg'
import { createClerkClient } from '@clerk/backend'

process.loadEnvFile?.('backend/.env.local')

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
})

const audit = await pool.query(`
  SELECT
    a.id,
    a.created_at,
    a.status,
    a.source,
    a.reason,
    left(a.email, 2) || '***@' || split_part(a.email, '@', 2) AS email_mascarado,
    p.nome AS perfil_nome,
    p.perfil,
    p.tipo_vinculo,
    p.status AS perfil_status,
    (p.clerk_user_id IS NOT NULL) AS login_vinculado,
    coalesce(p.metadata->>'finance_only', 'false') AS somente_financeiro
  FROM password_recovery_audit a
  LEFT JOIN profiles p ON p.id = a.profile_id
  ORDER BY a.created_at DESC
  LIMIT 30
`)

const outbox = await pool.query(`
  SELECT
    o.id,
    o.created_at,
    o.sent_at,
    o.status,
    o.subject,
    left(o.to_address, 2) || '***@' || split_part(o.to_address, '@', 2) AS destinatario,
    o.payload->>'profile_id' AS profile_id,
    p.nome AS perfil_nome,
    p.perfil,
    p.tipo_vinculo,
    (p.clerk_user_id IS NOT NULL) AS login_vinculado
  FROM communication_outbox o
  LEFT JOIN profiles p ON p.id::text = o.payload->>'profile_id'
  WHERE o.payload->>'context' = 'password_recovery'
  ORDER BY o.created_at DESC
  LIMIT 30
`)

const vaniaProfiles = await pool.query(`
  SELECT
    id,
    nome,
    left(coalesce(email, ''), 2) || '***@' || split_part(coalesce(email, ''), '@', 2) AS email_mascarado,
    perfil,
    tipo_vinculo,
    status,
    (clerk_user_id IS NOT NULL) AS login_vinculado,
    coalesce(metadata->>'finance_only', 'false') AS somente_financeiro,
    created_at,
    updated_at
  FROM profiles
  WHERE nome ILIKE '%vania%'
  ORDER BY updated_at DESC
`)

const duplicatedEmails = await pool.query(`
  SELECT
    left(email, 2) || '***@' || split_part(email, '@', 2) AS email_mascarado,
    count(*)::int AS quantidade,
    string_agg(nome || ' [' || coalesce(tipo_vinculo, 'sem vínculo') || ']', ' | ' ORDER BY updated_at DESC) AS perfis
  FROM profiles
  WHERE email IS NOT NULL AND trim(email) <> ''
  GROUP BY lower(email), email
  HAVING count(*) > 1
  ORDER BY count(*) DESC
`)

const profileLinks = await pool.query(`
  SELECT clerk_user_id, nome, perfil, tipo_vinculo, status,
         coalesce(metadata->>'finance_only', 'false') AS somente_financeiro
  FROM profiles
  WHERE clerk_user_id IS NOT NULL
`)
const linksByClerk = new Map(profileLinks.rows.map(row => [row.clerk_user_id, row]))
const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY })
const clerkUsers = await clerk.users.getUserList({ limit: 100, orderBy: '-created_at' })
const orphanClerkUsers = clerkUsers.data
  .filter(user => !linksByClerk.has(user.id))
  .map(user => {
    const email = user.primaryEmailAddress?.emailAddress ?? user.emailAddresses?.[0]?.emailAddress ?? ''
    const [local, domain] = email.split('@')
    return {
      id: user.id,
      nome: [user.firstName, user.lastName].filter(Boolean).join(' '),
      email_mascarado: domain ? `${local.slice(0, 2)}***@${domain}` : '',
      criado_em: new Date(user.createdAt).toISOString(),
    }
  })
const clerkNameMismatches = clerkUsers.data
  .filter(user => linksByClerk.has(user.id))
  .map(user => {
    const profile = linksByClerk.get(user.id)
    const clerkName = [user.firstName, user.lastName].filter(Boolean).join(' ').trim()
    return { id: user.id, clerk_nome: clerkName, perfil_nome: profile.nome }
  })
  .filter(item => item.clerk_nome.localeCompare(item.perfil_nome, 'pt-BR', { sensitivity: 'base' }) !== 0)

console.log(JSON.stringify({
  audit: audit.rows,
  outbox: outbox.rows,
  perfis_vania: vaniaProfiles.rows,
  emails_duplicados: duplicatedEmails.rows,
  contas_clerk_sem_perfil: orphanClerkUsers,
  nomes_divergentes_clerk_perfil: clerkNameMismatches,
}, null, 2))
await pool.end()
