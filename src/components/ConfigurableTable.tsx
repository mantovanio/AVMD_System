import { useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import { GripVertical, RotateCcw, Search } from 'lucide-react'

export type ConfigurableColumn<T> = {
  id: string
  label: string
  width?: number
  minWidth?: number
  accessor: (row: T) => unknown
  render?: (row: T) => ReactNode
  className?: string
}

type SavedLayout = { order: string[]; widths: Record<string, number> }

export function ConfigurableTable<T>({
  storageKey,
  columns,
  rows,
  rowKey,
}: {
  storageKey: string
  columns: ConfigurableColumn<T>[]
  rows: T[]
  rowKey: (row: T) => string
}) {
  const defaultLayout = useMemo<SavedLayout>(() => ({
    order: columns.map(column => column.id),
    widths: Object.fromEntries(columns.map(column => [column.id, column.width ?? 170])),
  }), [columns])
  const [layout, setLayout] = useState<SavedLayout>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(`avmd:table:${storageKey}`) ?? 'null') as SavedLayout | null
      if (!saved) return defaultLayout
      const validOrder = saved.order.filter(id => columns.some(column => column.id === id))
      const missing = columns.map(column => column.id).filter(id => !validOrder.includes(id))
      return { order: [...validOrder, ...missing], widths: { ...defaultLayout.widths, ...saved.widths } }
    } catch {
      return defaultLayout
    }
  })
  const [filters, setFilters] = useState<Record<string, string>>({})
  const draggedId = useRef<string | null>(null)

  useEffect(() => {
    localStorage.setItem(`avmd:table:${storageKey}`, JSON.stringify(layout))
  }, [layout, storageKey])

  const orderedColumns = layout.order
    .map(id => columns.find(column => column.id === id))
    .filter((column): column is ConfigurableColumn<T> => Boolean(column))

  const visibleRows = useMemo(() => rows.filter(row => orderedColumns.every(column => {
    const filter = filters[column.id]?.trim().toLocaleLowerCase('pt-BR')
    if (!filter) return true
    return String(column.accessor(row) ?? '').toLocaleLowerCase('pt-BR').includes(filter)
  })), [filters, orderedColumns, rows])

  function moveColumn(targetId: string) {
    const sourceId = draggedId.current
    if (!sourceId || sourceId === targetId) return
    setLayout(current => {
      const order = current.order.filter(id => id !== sourceId)
      order.splice(order.indexOf(targetId), 0, sourceId)
      return { ...current, order }
    })
    draggedId.current = null
  }

  function startResize(event: ReactPointerEvent, column: ConfigurableColumn<T>) {
    event.preventDefault()
    event.stopPropagation()
    const startX = event.clientX
    const startWidth = layout.widths[column.id] ?? column.width ?? 170
    const onMove = (moveEvent: PointerEvent) => {
      const width = Math.max(column.minWidth ?? 90, startWidth + moveEvent.clientX - startX)
      setLayout(current => ({ ...current, widths: { ...current.widths, [column.id]: width } }))
    }
    const onEnd = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onEnd)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onEnd)
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3 px-4 py-2 border-b border-gray-100 dark:border-gray-800 bg-gray-50/70 dark:bg-gray-900">
        <span className="text-xs text-gray-500">{visibleRows.length} de {rows.length} registros</span>
        <button type="button" onClick={() => { setLayout(defaultLayout); setFilters({}) }} className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-blue-600">
          <RotateCcw size={13} /> Restaurar colunas
        </button>
      </div>
      <div className="overflow-auto max-h-[65vh]">
        <table className="table-fixed text-sm" style={{ width: orderedColumns.reduce((total, column) => total + (layout.widths[column.id] ?? 170), 0) }}>
          <colgroup>{orderedColumns.map(column => <col key={column.id} style={{ width: layout.widths[column.id] ?? 170 }} />)}</colgroup>
          <thead className="sticky top-0 z-20 bg-white dark:bg-gray-900">
            <tr className="text-left text-gray-600 border-b border-gray-200 dark:border-gray-800">
              {orderedColumns.map(column => (
                <th key={column.id} draggable onDragStart={() => { draggedId.current = column.id }} onDragOver={event => event.preventDefault()} onDrop={() => moveColumn(column.id)} className="relative px-2 py-2 font-semibold select-none cursor-grab active:cursor-grabbing">
                  <span className="flex items-center gap-1 truncate"><GripVertical size={13} className="shrink-0 text-gray-300" />{column.label}</span>
                  <span role="separator" onPointerDown={event => startResize(event, column)} className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-blue-500" />
                </th>
              ))}
            </tr>
            <tr className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/80">
              {orderedColumns.map(column => (
                <th key={column.id} className="px-2 py-1.5">
                  <div className="relative">
                    <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input value={filters[column.id] ?? ''} onChange={event => setFilters(current => ({ ...current, [column.id]: event.target.value }))} placeholder="Filtrar..." className="w-full rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 py-1 pl-6 pr-2 text-xs font-normal outline-none focus:border-blue-500" />
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>{visibleRows.map(row => (
            <tr key={rowKey(row)} className="border-b border-gray-100 dark:border-gray-800/70 hover:bg-blue-50/40 dark:hover:bg-blue-950/20">
              {orderedColumns.map(column => <td key={column.id} className={`px-3 py-2 align-top overflow-hidden text-ellipsis ${column.className ?? ''}`} title={String(column.accessor(row) ?? '')}>{column.render ? column.render(row) : String(column.accessor(row) ?? '—')}</td>)}
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  )
}
