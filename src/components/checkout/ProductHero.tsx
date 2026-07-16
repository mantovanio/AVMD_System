import { ExternalLink } from 'lucide-react'
import { ProductTags } from './ProductTags'
import { formatCurrency } from './formatUtils'
import { getProductProfile, type LojaItemRow } from '@/lib/checkout'

interface ProductHeroProps {
  item: LojaItemRow
}

export function ProductHero({ item }: ProductHeroProps) {
  const title = item.certificados?.tipo ?? 'Produto'
  const profile = getProductProfile(item.certificados)
  const persona = profile.kind === 'e-CNPJ' ? 'e-CNPJ' : 'e-CPF'
  return (
    <article className="rounded-[28px] border border-slate-200 bg-white p-6 sm:p-7 shadow-sm">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="max-w-2xl">
          <h3 className="text-2xl font-semibold leading-tight text-slate-900">{title}</h3>
          <p className="text-sm text-slate-500 mt-3 leading-relaxed">{profile.details}</p>
          <div className="mt-4 rounded-[22px] border border-sky-200 bg-sky-50/70 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">Como escolher certo</p>
            <div className="mt-3 grid gap-2 text-sm text-slate-700">
              <div><strong className="text-slate-900">1.</strong> Confirme se é <strong>{persona}</strong>.</div>
              <div><strong className="text-slate-900">2.</strong> Confirme se é <strong>{profile.certificateClass}</strong>.</div>
              <div><strong className="text-slate-900">3.</strong> Confira a <strong>validade</strong> e só então avance para o pagamento.</div>
            </div>
          </div>
          <ProductTags item={item} />
        </div>
        <div className="rounded-[24px] bg-slate-50 px-5 py-4 min-w-[220px]">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-400 font-semibold">Valor final</p>
          <p className="text-3xl font-semibold text-emerald-600 mt-2">{formatCurrency(item.valor)}</p>
        </div>
      </div>

      {item.link_safeweb?.trim() && (
        <button
          type="button"
          onClick={() => window.open(item.link_safeweb!, '_blank', 'noopener,noreferrer')}
          className="mt-5 inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50"
        >
          <ExternalLink size={15} />
          Abrir link externo deste produto
        </button>
      )}
    </article>
  )
}
