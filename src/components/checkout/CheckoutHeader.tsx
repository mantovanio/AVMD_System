import { AlertTriangle, ArrowRight, ShieldCheck } from 'lucide-react'
import type { PaymentRuntime } from '@/lib/checkout'

interface CheckoutHeaderProps {
  lojaNome: string
  paymentRuntime: PaymentRuntime
  logoUrl?: string | null
}

export function CheckoutHeader({ lojaNome, paymentRuntime, logoUrl }: CheckoutHeaderProps) {
  const src = logoUrl?.trim() || '/favicon.svg'
  return (
    <header className="border-b border-slate-200/80 bg-white/95 backdrop-blur-md sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 rounded-2xl border border-slate-200 bg-white flex items-center justify-center shadow-sm p-2 overflow-hidden">
            <img src={src} alt="CertiID" className="w-full h-full object-contain" />
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-[0.24em] text-[#ea7b18] font-semibold">Checkout por link</p>
            <h1 className="text-xl font-semibold leading-tight">CertiID</h1>
            <p className="text-sm text-slate-500 mt-0.5">{lojaNome}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a
            href="/?page=portal"
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:border-[#17346b] hover:text-[#17346b] transition-colors"
          >
            Meus pedidos
            <ArrowRight size={14} />
          </a>
          <span className="inline-flex items-center gap-2 rounded-full bg-[#fff4ea] px-3 py-2 text-xs font-semibold text-[#ad5207]">
            <ShieldCheck size={14} />
            Atendimento online
          </span>
          {paymentRuntime.modo_teste_geral && (
            <span className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-2 text-xs font-semibold text-amber-800">
              <AlertTriangle size={14} />
              Ambiente de teste
            </span>
          )}
        </div>
      </div>
    </header>
  )
}
