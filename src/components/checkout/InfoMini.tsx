interface InfoMiniProps {
  label: string
  value: string
}

export function InfoMini({ label, value }: InfoMiniProps) {
  return (
    <div className="rounded-2xl bg-white/80 border border-emerald-100 px-3 py-3">
      <p className="text-[11px] uppercase tracking-[0.16em] text-emerald-700/70 font-semibold">{label}</p>
      <p className="text-sm font-medium text-emerald-950 mt-2 break-words">{value}</p>
    </div>
  )
}
