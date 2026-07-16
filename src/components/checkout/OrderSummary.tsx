import { Loader2 } from 'lucide-react'
import { ProductTags } from './ProductTags'
import { InfoLine } from './InfoLine'
import { formatCurrency, formatDateTime } from './formatUtils'
import { getProductProfile, type LojaItemRow, type PaymentOption, type AgendaSlot } from '@/lib/checkout'

interface OrderSummaryProps {
  item: LojaItemRow | null
  billingName: string
  billingContact: string
  holderName: string
  paymentLabel: string
  selectedSlot: AgendaSlot | null
  error: string | null
  checkoutSuccess: string | null
  checkoutLoading: boolean
  onCheckout: () => void
}

export function OrderSummary({
  item,
  billingName,
  billingContact,
  holderName,
  paymentLabel,
  selectedSlot,
  error,
  checkoutSuccess,
  checkoutLoading,
  onCheckout,
}: OrderSummaryProps) {
  return (
    <aside className="xl:sticky xl:top-24 space-y-4">
      <div className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-[11px] uppercase tracking-[0.22em] text-slate-400 font-semibold">Resumo da compra</p>
        {item ? (
          <>
            <div className="mt-4 rounded-[24px] bg-slate-50 p-4">
              <p className="text-lg font-semibold text-slate-900">{getProductProfile(item.certificados).displayName}</p>
              <p className="text-sm text-slate-500 mt-2 leading-relaxed">{getProductProfile(item.certificados).details}</p>
              <ProductTags item={item} compact />
              <p className="text-3xl font-semibold text-emerald-600 mt-4">{formatCurrency(item.valor)}</p>
            </div>

            <div className="mt-4 space-y-3">
              <InfoLine label="Faturamento" value={billingName || 'Aguardando preenchimento'} />
              <InfoLine label="Contato principal" value={billingContact || 'Aguardando preenchimento'} />
              <InfoLine label="Titular do certificado" value={holderName || 'Aguardando definição'} />
              <InfoLine label="Pagamento" value={paymentLabel || 'Aguardando escolha'} />
              <InfoLine
                label="Agendamento"
                value={selectedSlot ? formatDateTime(selectedSlot.inicio) : 'Pendente'}
                tone={selectedSlot ? 'default' : 'warn'}
              />
            </div>
          </>
        ) : (
          <div className="mt-4 rounded-[24px] bg-slate-50 p-4 text-sm text-slate-500">
            Selecione um produto para liberar o resumo da compra.
          </div>
        )}
      </div>

      <div className="rounded-[30px] border border-[#fde4cf] bg-[#fffaf4] p-5 shadow-sm">
        <p className="text-sm font-semibold text-slate-900">Antes de finalizar</p>
        <ul className="mt-3 space-y-2 text-sm text-slate-600">
          <li>Confirme seu e-mail e seu WhatsApp para receber nosso contato.</li>
          <li>Se quem paga for diferente de quem recebe o certificado, revise os dois blocos com atenção.</li>
          <li>Sua validação só será atendida após a compensação do pagamento.</li>
        </ul>
      </div>

      {error && (
        <div className="rounded-[24px] border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-700 shadow-sm">
          {error}
        </div>
      )}

      {checkoutSuccess && (
        <div className="rounded-[24px] border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-700 shadow-sm">
          {checkoutSuccess}
        </div>
      )}

      <button
        type="button"
        onClick={onCheckout}
        disabled={checkoutLoading || !item}
        className="hidden xl:inline-flex w-full items-center justify-center rounded-[22px] px-5 py-4 bg-[#ea7b18] text-white text-sm font-semibold hover:bg-[#cf6611] disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-[#fde4cf]"
      >
        {checkoutLoading ? (
          <>
            <Loader2 size={16} className="animate-spin mr-2" />
            Finalizando compra...
          </>
        ) : 'Concluir compra'}
      </button>
    </aside>
  )
}
