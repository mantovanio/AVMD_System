import { ExternalLink } from 'lucide-react'
import { ProductTags } from './ProductTags'
import { formatCurrency } from './formatUtils'
import type { LojaItemRow } from '@/lib/checkout'

interface ProductHeroProps {
  item: LojaItemRow
}

export function ProductHero({ item }: ProductHeroProps) {
  return (
    <article className="rounded-[28px] border border-slate-200 bg-white p-6 sm:p-7 shadow-sm">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="max-w-2xl">
          <h3 className="text-2xl font-semibold leading-tight text-slate-900">{item.certificados?.tipo ?? 'Produto'}</h3>
          {(item.certificados?.descricao_produto ?? item.certificados?.descricao) && (
            <p className="text-sm text-slate-500 mt-3 leading-relaxed">
              {item.certificados?.descricao_produto ?? item.certificados?.descricao}
            </p>
          )}
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
