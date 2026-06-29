interface WarningCardProps {
  text: string
}

export function WarningCard({ text }: WarningCardProps) {
  return (
    <div className="rounded-[22px] border border-[#fde4cf] bg-[#fffaf4] p-4 text-sm text-slate-700 leading-relaxed">
      {text}
    </div>
  )
}
