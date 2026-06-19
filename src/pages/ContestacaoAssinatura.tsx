import { useEffect, useMemo, useState } from 'react'
import { ExternalLink, FileSignature, RefreshCcw, ShieldCheck } from 'lucide-react'
import { getEdgeFunctionUrl } from '@/lib/supabase'

type DocumentoStatus = 'rascunho' | 'assinando' | 'concluido' | 'cancelado'
type SignatarioStatus = 'pendente' | 'enviado' | 'assinado' | 'recusado' | 'expirado'

interface ContestacaoDocumento {
  id: string
  titulo: string
  descricao: string | null
  pdf_url: string
  status: DocumentoStatus
  provedor_assinatura: string | null
  assinatura_base_url: string | null
  updated_at: string
}

interface ContestacaoSignatario {
  id: string
  nome: string
  email: string
  cargo: string | null
  status: SignatarioStatus
  ordem: number
  assinatura_url: string | null
  certificado_subject: string | null
  assinado_em: string | null
  observacoes: string | null
}

const DOCUMENTO_STATUS_LABEL: Record<DocumentoStatus, string> = {
  rascunho: 'Rascunho',
  assinando: 'Coletando assinaturas',
  concluido: 'Concluído',
  cancelado: 'Cancelado',
}

const SIGNATARIO_STATUS_LABEL: Record<SignatarioStatus, string> = {
  pendente: 'Pendente',
  enviado: 'Aguardando assinatura',
  assinado: 'Assinado',
  recusado: 'Recusado',
  expirado: 'Expirado',
}

const SIGNATARIO_STATUS_STYLE: Record<SignatarioStatus, string> = {
  pendente: 'bg-amber-100 text-amber-800 border-amber-200',
  enviado: 'bg-sky-100 text-sky-800 border-sky-200',
  assinado: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  recusado: 'bg-rose-100 text-rose-800 border-rose-200',
  expirado: 'bg-slate-200 text-slate-700 border-slate-300',
}

export default function ContestacaoAssinatura({ token }: { token: string }) {
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')
  const [documento, setDocumento] = useState<ContestacaoDocumento | null>(null)
  const [signatarios, setSignatarios] = useState<ContestacaoSignatario[]>([])
  const [ultimaAtualizacao, setUltimaAtualizacao] = useState<Date | null>(null)

  useEffect(() => {
    let ativo = true

    async function carregar() {
      setErro('')
      const response = await fetch(getEdgeFunctionUrl('contestacao-public'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })

      const payload = await response.json().catch(() => ({ ok: false, error: 'Resposta inválida.' }))

      if (!ativo) return

      if (!response.ok || !payload?.ok) {
        setErro(String(payload?.error ?? 'Não foi possível carregar o documento.'))
        setDocumento(null)
        setSignatarios([])
        setLoading(false)
        return
      }

      setDocumento(payload.documento as ContestacaoDocumento)
      setSignatarios((payload.signatarios ?? []) as ContestacaoSignatario[])
      setUltimaAtualizacao(new Date())
      setLoading(false)
    }

    void carregar()
    const timer = window.setInterval(() => { void carregar() }, 15000)

    return () => {
      ativo = false
      window.clearInterval(timer)
    }
  }, [token])

  const resumo = useMemo(() => {
    const total = signatarios.length
    const assinados = signatarios.filter(item => item.status === 'assinado').length
    const pendentes = signatarios.filter(item => item.status !== 'assinado').length
    return { total, assinados, pendentes }
  }, [signatarios])

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.18),_transparent_28%),linear-gradient(135deg,#eff6ff_0%,#f8fafc_42%,#e2e8f0_100%)] text-slate-900">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <header className="mb-6 overflow-hidden rounded-[28px] border border-white/70 bg-white/85 shadow-[0_30px_80px_-40px_rgba(15,23,42,0.5)] backdrop-blur">
          <div className="flex flex-col gap-5 p-6 lg:flex-row lg:items-center lg:justify-between lg:p-8">
            <div className="max-w-3xl">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">
                <ShieldCheck size={14} />
                Contestação com assinatura digital
              </div>
              <h1 className="text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">
                {loading ? 'Carregando documento' : (documento?.titulo ?? 'Documento indisponível')}
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
                {documento?.descricao?.trim() || 'Página pública para leitura do PDF, acompanhamento das assinaturas e abertura do assinador com certificado digital.'}
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-slate-500">
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 font-medium">
                  {documento ? DOCUMENTO_STATUS_LABEL[documento.status] : 'Carregando status'}
                </span>
                {documento?.provedor_assinatura && (
                  <span className="rounded-full border border-slate-200 bg-white px-3 py-1">
                    Provedor: {documento.provedor_assinatura}
                  </span>
                )}
                {ultimaAtualizacao && (
                  <span>
                    Atualizado às {ultimaAtualizacao.toLocaleTimeString('pt-BR')}
                  </span>
                )}
              </div>
            </div>

            <div className="grid min-w-[280px] grid-cols-3 gap-3">
              <ResumoCard label="Participantes" valor={String(resumo.total)} />
              <ResumoCard label="Assinados" valor={String(resumo.assinados)} />
              <ResumoCard label="Pendentes" valor={String(resumo.pendentes)} />
            </div>
          </div>
        </header>

        {erro && (
          <div className="mb-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {erro}
          </div>
        )}

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(340px,0.9fr)]">
          <section className="overflow-hidden rounded-[28px] border border-white/70 bg-white/90 shadow-[0_30px_80px_-40px_rgba(15,23,42,0.45)]">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-900 text-white">
                  <FileSignature size={20} />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">Documento da contestação</h2>
                  <p className="text-sm text-slate-500">Leitura online do PDF publicado</p>
                </div>
              </div>
              {documento?.pdf_url && (
                <a
                  href={documento.pdf_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
                >
                  Abrir PDF
                  <ExternalLink size={16} />
                </a>
              )}
            </div>

            <div className="bg-slate-100 p-3 sm:p-4">
              {documento?.pdf_url ? (
                <iframe
                  title="Documento da contestação"
                  src={documento.pdf_url}
                  className="h-[72vh] w-full rounded-2xl border border-slate-200 bg-white"
                />
              ) : (
                <div className="flex h-[50vh] items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
                  O PDF ainda não foi vinculado a este documento.
                </div>
              )}
            </div>
          </section>

          <aside className="space-y-6">
            <section className="rounded-[28px] border border-white/70 bg-white/90 p-5 shadow-[0_30px_80px_-40px_rgba(15,23,42,0.45)]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold text-slate-900">Participantes da assinatura</h2>
                  <p className="text-sm text-slate-500">Status atualizado automaticamente</p>
                </div>
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
                >
                  <RefreshCcw size={15} />
                  Atualizar
                </button>
              </div>

              <div className="mt-4 space-y-3">
                {signatarios.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-500">
                    Nenhum signatário foi cadastrado ainda.
                  </div>
                ) : signatarios.map((participante) => {
                  const assinaturaUrl = participante.assinatura_url || documento?.assinatura_base_url || null

                  return (
                    <article key={participante.id} className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-bold text-slate-900">{participante.ordem}. {participante.nome}</p>
                          <p className="text-xs text-slate-500">{participante.email}</p>
                          {participante.cargo && (
                            <p className="mt-1 text-xs text-slate-500">{participante.cargo}</p>
                          )}
                        </div>
                        <span className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${SIGNATARIO_STATUS_STYLE[participante.status]}`}>
                          {SIGNATARIO_STATUS_LABEL[participante.status]}
                        </span>
                      </div>

                      {participante.assinado_em && (
                        <p className="mt-3 text-xs text-slate-500">
                          Assinado em {new Date(participante.assinado_em).toLocaleString('pt-BR')}
                        </p>
                      )}

                      {participante.certificado_subject && (
                        <p className="mt-2 rounded-xl bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                          Certificado registrado: {participante.certificado_subject}
                        </p>
                      )}

                      {participante.observacoes && (
                        <p className="mt-2 text-xs text-slate-500">{participante.observacoes}</p>
                      )}

                      {assinaturaUrl && participante.status !== 'assinado' && documento?.status === 'assinando' && (
                        <a
                          href={assinaturaUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-4 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
                        >
                          Assinar com certificado digital
                          <ExternalLink size={16} />
                        </a>
                      )}
                    </article>
                  )
                })}
              </div>
            </section>

            <section className="rounded-[28px] border border-blue-100 bg-gradient-to-br from-blue-50 to-cyan-50 p-5 text-sm text-slate-700 shadow-[0_30px_80px_-40px_rgba(59,130,246,0.35)]">
              <h2 className="text-base font-bold text-slate-900">Como esse link funciona</h2>
              <ul className="mt-3 space-y-2 leading-6">
                <li>O PDF fica publicado em uma URL pública do app.</li>
                <li>O status dos participantes vem do Supabase e é atualizado nesta página.</li>
                <li>O botão de assinatura deve apontar para o assinador ICP-Brasil escolhido.</li>
              </ul>
            </section>
          </aside>
        </div>
      </div>
    </div>
  )
}

function ResumoCard({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-center">
      <div className="text-2xl font-black text-slate-900">{valor}</div>
      <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</div>
    </div>
  )
}
