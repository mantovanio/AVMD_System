import { cn } from '@/lib/utils'
import type { LojaItemRow } from '@/lib/checkout'

function labelEmissao(tipo: string | null | undefined): string | null {
  if (!tipo) return null
  if (/online|video|vídeo|fast|remot/i.test(tipo)) return 'Fast'
  return tipo
}

interface ProductTagsProps {
  item: LojaItemRow
  compact?: boolean
}

export function ProductTags({ item, compact = false }: ProductTagsProps) {
  const cert = item.certificados
  const modelo = cert?.modelo?.trim() ?? ''
  const mostrarModelo = modelo && !/^(a1|a3)$/i.test(modelo)
  const classes = compact
    ? 'rounded-full px-2.5 py-1 text-[11px] font-medium'
    : 'rounded-full px-3 py-1 text-xs font-medium'

  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {mostrarModelo && (
        <span className={cn(classes, 'bg-slate-100 text-slate-600')}>{modelo}</span>
      )}
      {labelEmissao(cert?.tipo_emissao_padrao) && (
        <span className={cn(classes, 'bg-sky-50 text-sky-700')}>{labelEmissao(cert?.tipo_emissao_padrao)}</span>
      )}
      {cert?.periodo_uso && (
        <span className={cn(classes, 'bg-violet-50 text-violet-700')}>Uso: {cert.periodo_uso}</span>
      )}
      {cert?.validade && (
        <span className={cn(classes, 'bg-emerald-50 text-emerald-700')}>Validade: {cert.validade}</span>
      )}
    </div>
  )
}
