import { useState, useEffect, useMemo } from 'react'
import { Search, Calendar, Filter, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ConfigurableTable, type ConfigurableColumn } from '@/components/ConfigurableTable'

const t = (key: string, fallback: string, variables?: Record<string, string | number>) => {
  if (!variables) return fallback

  return fallback.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, variableName: string) => {
    const value = variables[variableName]
    return value === undefined ? `{{${variableName}}}` : String(value)
  })
}

interface Venda {
  id: string
  pedido: string
  protocolo: string
  nome: string
  cpf: string
  cnpj: string
  empresa: string
  data: string
  valor: number
  status: 'pendente' | 'concluido' | 'cancelado'
  agente: string
}

interface DateRange {
  start: string
  end: string
}

export function VendasSearch() {
  const [vendas, setVendas] = useState<Venda[]>([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const [dataFiltro, setDataFiltro] = useState<DateRange>({ start: '', end: '' })
  const [statusFiltro, setStatusFiltro] = useState<string>('')
  const [showFiltros, setShowFiltros] = useState(false)

  const columns: ConfigurableColumn<Venda>[] = [
    {
      id: 'pedido',
      label: t('pedido', 'Pedido'),
      accessor: (row: Venda) => row.pedido,
      render: (row: Venda) => <span className="font-mono text-xs">{row.pedido}</span>,
    },
    {
      id: 'protocolo',
      label: t('protocolo', 'Protocolo'),
      accessor: (row: Venda) => row.protocolo,
      render: (row: Venda) => <span className="font-mono text-xs">{row.protocolo}</span>,
    },
    {
      id: 'nome',
      label: t('nome', 'Nome'),
      accessor: (row: Venda) => row.nome,
      render: (row: Venda) => <span className="font-medium">{row.nome}</span>,
    },
    {
      id: 'cpf',
      label: t('cpf', 'CPF'),
      accessor: (row: Venda) => row.cpf,
      render: (row: Venda) => <span className="font-mono text-xs">{row.cpf}</span>,
    },
    {
      id: 'cnpj',
      label: t('cnpj', 'CNPJ'),
      accessor: (row: Venda) => row.cnpj,
      render: (row: Venda) => <span className="font-mono text-xs">{row.cnpj}</span>,
    },
    {
      id: 'empresa',
      label: t('empresa', 'Empresa'),
      accessor: (row: Venda) => row.empresa,
      render: (row: Venda) => <span className="text-sm">{row.empresa}</span>,
    },
    {
      id: 'data',
      label: t('data', 'Data'),
      accessor: (row: Venda) => row.data,
      render: (row: Venda) => <span className="text-xs">{new Date(row.data).toLocaleDateString('pt-BR')}</span>,
    },
    {
      id: 'valor',
      label: t('valor', 'Valor'),
      accessor: (row: Venda) => row.valor,
      render: (row: Venda) => <span className="text-right font-mono">R$ {row.valor.toFixed(2)}</span>,
    },
    {
      id: 'status',
      label: t('status', 'Status'),
      accessor: (row: Venda) => row.status,
      render: (row: Venda) => {
        const statusColors = {
          pendente: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
          concluido: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
          cancelado: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
        }
        const statusLabels = {
          pendente: t('pending', 'Pendente'),
          concluido: t('completed', 'Concluído'),
          cancelado: t('canceled', 'Cancelado'),
        }
        return (
          <span className={cn('inline-flex px-2 py-1 text-xs font-medium rounded-full', statusColors[row.status])}>
            {statusLabels[row.status]}
          </span>
        )
      },
    },
    {
      id: 'agente',
      label: t('agente', 'Agente'),
      accessor: (row: Venda) => row.agente,
      render: (row: Venda) => <span className="text-sm">{row.agente}</span>,
    },
  ]

  const filteredVendas = useMemo(() => vendas.filter(venda => {
    const matchBusca = !busca || 
      venda.pedido.toLowerCase().includes(busca.toLowerCase()) ||
      venda.protocolo.toLowerCase().includes(busca.toLowerCase()) ||
      venda.nome.toLowerCase().includes(busca.toLowerCase()) ||
      venda.cpf.includes(busca) ||
      venda.cnpj.includes(busca) ||
      venda.empresa.toLowerCase().includes(busca.toLowerCase()) ||
      venda.agente.toLowerCase().includes(busca.toLowerCase())

    const matchData = (!dataFiltro.start || !dataFiltro.end) || 
      new Date(venda.data) >= new Date(dataFiltro.start) &&
      new Date(venda.data) <= new Date(dataFiltro.end)

    const matchStatus = !statusFiltro || venda.status === statusFiltro

    return matchBusca && matchData && matchStatus
  }), [vendas, busca, dataFiltro, statusFiltro])

  useEffect(() => {
    const mockData: Venda[] = [
      {
        id: '1',
        pedido: 'PED-001',
        protocolo: 'PROT-2024-0001',
        nome: 'João Silva',
        cpf: '123.456.789-00',
        cnpj: '',
        empresa: 'Comércio LTDA',
        data: '2024-01-15T10:30:00Z',
        valor: 1500.00,
        status: 'concluido',
        agente: 'Maria',
      },
      {
        id: '2',
        pedido: 'PED-002',
        protocolo: 'PROT-2024-0002',
        nome: 'Empresa ABC S.A.',
        cpf: '',
        cnpj: '12.345.678/0001-90',
        empresa: 'Empresa ABC S.A.',
        data: '2024-01-14T14:45:00Z',
        valor: 5000.00,
        status: 'pendente',
        agente: 'Pedro',
      },
      {
        id: '3',
        pedido: 'PED-003',
        protocolo: 'PROT-2024-0003',
        nome: 'Maria Oliveira',
        cpf: '987.654.321-00',
        cnpj: '',
        empresa: 'Serviços XYZ',
        data: '2024-01-13T09:15:00Z',
        valor: 2300.50,
        status: 'concluido',
        agente: 'Maria',
      },
      {
        id: '4',
        pedido: 'PED-004',
        protocolo: 'PROT-2024-0004',
        nome: 'Indústria 123 Ltda',
        cpf: '',
        cnpj: '98.765.432/0001-21',
        empresa: 'Indústria 123 Ltda',
        data: '2024-01-12T16:20:00Z',
        valor: 8900.00,
        status: 'cancelado',
        agente: 'Carlos',
      },
      {
        id: '5',
        pedido: 'PED-005',
        protocolo: 'PROT-2024-0005',
        nome: 'Antônio Costa',
        cpf: '456.789.123-00',
        cnpj: '',
        empresa: 'Indústria 123 Ltda',
        data: '2024-01-11T11:00:00Z',
        valor: 3750.25,
        status: 'pendente',
        agente: 'Pedro',
      },
    ]
    setVendas(mockData)
    setLoading(false)
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">{t('vendas-search', 'Busca de Vendas')}</h2>
        <button
          type="button"
          onClick={() => setShowFiltros(!showFiltros)}
          className="inline-flex items-center gap-2 px-3 py-2 text-sm bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
        >
          <Filter size={16} />
          {showFiltros ? t('hide-filters', 'Ocultar filtros') : t('show-filters', 'Mostrar filtros')}
        </button>
      </div>

      <div className="relative">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder={t('search-placeholder', 'Buscar por pedido, protocolo, nome, CPF, CNPJ ou empresa...')}
          className="w-full pl-10 pr-4 py-3 border border-gray-300 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {showFiltros && (
        <div className="bg-gray-50 dark:bg-gray-900 rounded-xl p-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t('data-inicial', 'Data Inicial')}
              </label>
              <input
                type="date"
                value={dataFiltro.start}
                onChange={(e) => setDataFiltro(prev => ({ ...prev, start: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t('data-final', 'Data Final')}
              </label>
              <input
                type="date"
                value={dataFiltro.end}
                onChange={(e) => setDataFiltro(prev => ({ ...prev, end: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t('status', 'Status')}
              </label>
              <select
                value={statusFiltro}
                onChange={(e) => setStatusFiltro(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-sm"
              >
                <option value="">{t('all-status', 'Todos os status')}</option>
                <option value="pendente">{t('pending', 'Pendente')}</option>
                <option value="concluido">{t('completed', 'Concluído')}</option>
                <option value="cancelado">{t('canceled', 'Cancelado')}</option>
              </select>
            </div>
          </div>

          {(dataFiltro.start || dataFiltro.end || statusFiltro) && (
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setDataFiltro({ start: '', end: '' })
                  setStatusFiltro('')
                }}
                className="inline-flex items-center gap-1 px-3 py-1 text-xs bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-full hover:bg-red-200 dark:hover:bg-red-800/30 transition-colors"
              >
                <X size={12} />
                {t('clear-filters', 'Limpar filtros')}
              </button>
            </div>
          )}
        </div>
      )}

      <ConfigurableTable
        storageKey="vendas-search"
        columns={columns}
        rows={filteredVendas}
        rowKey={(row) => row.id}
        pageSize={10}
      />

      <div className="text-sm text-gray-500 dark:text-gray-400">
        {t('results-count', '{{count}} de {{total}} registros', { count: filteredVendas.length, total: vendas.length })}
      </div>
    </div>
  )
}