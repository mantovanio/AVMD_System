import { CheckCircle2, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ProductTags } from './ProductTags'
import { formatCurrency } from './formatUtils'
import { getProductProfile, type LojaItemRow } from '@/lib/checkout'

interface ProductCardProps {
  item: LojaItemRow
  selected: boolean
  onSelect: (id: string) => void
}

export function ProductCard({ item, selected, onSelect }: ProductCardProps) {
  const cert = item.certificados
  const profile = getProductProfile(cert)

  return (
    <article
      className={cn(
        'rounded-[26px] border bg-white p-5 shadow-sm transition-all duration-200',
        selected ? 'border-[#ea7b18] ring-2 ring-[#fde4cf] shadow-md' : 'border-slate-200 hover:border-slate-300 hover:-translate-y-0.5'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold leading-snug">{profile.displayName}</h3>
          <p className="text-sm text-slate-500 mt-2 leading-relaxed">{profile.commercialDescription}</p>
        </div>
        {selected && <CheckCircle2 size={18} className="text-[#ea7b18] shrink-0" />}
      </div>

      <ProductTags item={item} />

      <div className="mt-5 flex items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-slate-400 font-semibold">Valor</p>
          <p className="text-2xl font-semibold text-emerald-600 mt-1">{formatCurrency(item.valor)}</p>
        </div>
        <button
          type="button"
          onClick={() => onSelect(item.id)}
          className={cn(
            'inline-flex items-center justify-center rounded-2xl px-4 py-3 text-sm font-semibold min-w-[160px]',
            selected ? 'bg-slate-900 text-white' : 'bg-[#17346b] text-white hover:bg-[#102654]'
          )}
        >
          {selected ? 'Selecionado' : 'Escolher produto'}
        </button>
      </div>

      {item.link_safeweb?.trim() && (
        <button
          type="button"
          onClick={() => window.open(item.link_safeweb!, '_blank', 'noopener,noreferrer')}
          className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-slate-700"
        >
          <ExternalLink size={14} />
          Abrir link externo deste produto
        </button>
      )}
    </article>
  )
}
