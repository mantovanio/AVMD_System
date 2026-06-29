interface SelectFieldProps {
  label: string
  value: string
  onChange: (value: string) => void
  options: Array<{ value: string; label: string }>
  disabled?: boolean
}

export function SelectField({
  label,
  value,
  onChange,
  options,
  disabled = false,
}: SelectFieldProps) {
  return (
    <label className="block">
      <span className="text-xs uppercase tracking-[0.18em] text-slate-400 font-semibold">{label}</span>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none focus:border-[#17346b] focus:ring-2 focus:ring-sky-100 disabled:bg-slate-100 disabled:text-slate-400"
      >
        {options.map(option => (
          <option key={`${label}-${option.value || 'empty'}`} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}
