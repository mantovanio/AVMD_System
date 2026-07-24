import { cn } from '@/lib/utils'
import {
  buildNfsePreviewData,
  normalizeNfseModeloLayout,
  type NfseModeloLayout,
} from '@/lib/nfse'
import type { AgencyConfig } from '@/lib/agencyConfig'
import type { NfseConfiguracao, NfseEmitida, VendaCertificado } from '@/types'

type Props = {
  modelo?: Partial<NfseModeloLayout> | null
  configuracao?: Partial<NfseConfiguracao> | null
  nota?: Partial<NfseEmitida> | null
  venda?: Partial<VendaCertificado> | null
  fallbackDiscriminacao?: string | null
  agency?: Partial<AgencyConfig> | null
  logoUrl?: string | null
  className?: string
}

function formatDateTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('pt-BR')
}

function formatDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('pt-BR')
}

function formatCurrency(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function Row({
  label,
  value,
  className,
}: {
  label: string
  value: string
  className?: string
}) {
  return (
    <div className={cn('border-r border-gray-500 last:border-r-0 px-2 py-1.5 min-h-[46px]', className)}>
      <div className="text-[10px] uppercase tracking-wide text-gray-600">{label}</div>
      <div className="text-[11px] font-medium text-gray-900 leading-snug whitespace-pre-wrap">{value || '—'}</div>
    </div>
  )
}

function SectionTitle({ children }: { children: string }) {
  return (
    <div className="bg-gray-300 border-t border-b border-gray-600 px-2 py-1 text-[11px] font-semibold text-center uppercase tracking-wide text-gray-900">
      {children}
    </div>
  )
}

export default function NfseDocumentPreview({
  modelo,
  configuracao,
  nota,
  venda,
  fallbackDiscriminacao,
  agency,
  logoUrl = '/favicon.svg',
  className,
}: Props) {
  const layout = normalizeNfseModeloLayout(modelo)
  const data = buildNfsePreviewData({ modelo, configuracao, nota, venda, fallbackDiscriminacao, agency })

  return (
    <div className={cn('rounded-2xl border border-gray-400 bg-white text-gray-950 shadow-sm overflow-hidden', className)}>
      <div className="min-w-[760px] bg-white">
        <div className="grid grid-cols-[92px_minmax(0,1fr)_138px_96px] border-b border-gray-600">
          <div className="flex items-center justify-center border-r border-gray-600 p-2">
            {layout.mostrar_logo ? (
              <img
                src={logoUrl ?? undefined}
                alt="Logo da operacao"
                className="h-14 w-14 object-contain"
              />
            ) : (
              <div className="flex h-14 w-14 items-center justify-center rounded-full border border-gray-400 text-[10px] font-semibold text-gray-500">
                SEM LOGO
              </div>
            )}
          </div>
          <div className="border-r border-gray-600 px-3 py-2 text-center">
            <div className="text-[11px] font-semibold uppercase">{data.cabecalhoMunicipio}</div>
            <div className="text-[11px] font-semibold uppercase">{data.cabecalhoSecretaria}</div>
            <div className="mt-2 text-[19px] font-medium uppercase leading-tight">{layout.titulo}</div>
            <div className="text-[10px] uppercase tracking-wide text-gray-600">{layout.subtitulo}</div>
          </div>
          <div className="border-r border-gray-600 px-3 py-2 text-center">
            <div className="text-[10px] uppercase tracking-wide text-gray-600">Numero da NFS-e</div>
            <div className="mt-2 text-[28px] font-semibold leading-none">{data.numeroNf}</div>
          </div>
          <div className="flex items-center justify-center p-2">
            <div className="grid h-20 w-20 grid-cols-6 gap-[2px] rounded-sm border border-gray-500 bg-white p-1">
              {Array.from({ length: 36 }).map((_, index) => (
                <span
                  key={index}
                  className={cn('rounded-[1px]', index % 2 === 0 || index % 5 === 0 ? 'bg-gray-900' : 'bg-gray-200')}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-[1.25fr_1fr_1fr_1.25fr] border-b border-gray-600">
          <Row label="Data e Hora da Emissao" value={formatDateTime(data.dataEmissao)} />
          <Row label="Competencia" value={formatDate(data.competencia)} />
          <Row label="Codigo de Verificacao" value={data.codigoVerificacao} />
          <Row label="Local da Prestacao" value={data.localPrestacao} />
        </div>

        <SectionTitle>Dados do Prestador de Servicos</SectionTitle>
        <div className="grid grid-cols-[1.3fr_1fr] border-b border-gray-500">
          <Row label="Razao Social / Nome" value={data.prestador.nome} />
          <Row label="Nome Fantasia" value={String(configuracao?.nome_fantasia_emitente?.trim() || (configuracao?.payload_reforma_tributaria as Record<string, unknown> | undefined)?.nome_fantasia ?? agency?.nome_agencia ?? configuracao?.identificador ?? '—')} />
        </div>
        <div className="grid grid-cols-[1fr_140px_1fr] border-b border-gray-500">
          <Row label="CNPJ / CPF" value={data.prestador.documento} />
          <Row label="Inscricao Municipal" value={data.prestador.inscricaoMunicipal} />
          <Row label="Municipio" value={data.prestador.municipio} />
        </div>
        <div className="grid grid-cols-[1.3fr_1fr_1fr] border-b border-gray-500">
          <Row label="Endereco e CEP" value={data.prestador.endereco} />
          <Row label="Telefone" value={data.prestador.telefone} />
          <Row label="E-mail" value={data.prestador.email} />
        </div>
        <div className="border-b border-gray-600 px-2 py-1.5 min-h-[38px]">
          <div className="text-[10px] uppercase tracking-wide text-gray-600">Complemento</div>
          <div className="text-[11px] font-medium text-gray-900">{data.prestador.complemento || '—'}</div>
        </div>

        <SectionTitle>Dados do Tomador de Servicos</SectionTitle>
        <div className="grid grid-cols-[1.3fr_1fr] border-b border-gray-500">
          <Row label="Razao Social / Nome" value={data.tomador.nome} />
          <Row label="CNPJ / CPF" value={data.tomador.documento} />
        </div>
        <div className="grid grid-cols-[1.3fr_150px_1fr] border-b border-gray-500">
          <Row label="Endereco e CEP" value={data.tomador.endereco} />
          <Row label="Inscricao Municipal" value={data.tomador.inscricaoMunicipal} />
          <Row label="Municipio" value={data.tomador.municipio} />
        </div>
        <div className="grid grid-cols-[1fr_1fr_1fr] border-b border-gray-500">
          <Row label="Complemento" value={data.tomador.complemento} />
          <Row label="Telefone" value={data.tomador.telefone} />
          <Row label="E-mail" value={data.tomador.email} />
        </div>

        <SectionTitle>{layout.bloco_servico_titulo}</SectionTitle>
        <div className="border-b border-gray-600 px-3 py-3 min-h-[132px]">
          <div className="whitespace-pre-wrap text-[12px] leading-relaxed text-gray-900">{data.discriminacaoServicos}</div>
        </div>

        <SectionTitle>Codigo do Servico / Atividade</SectionTitle>
        <div className="border-b border-gray-600 px-3 py-2 text-[11px] font-medium text-gray-900">
          {data.codigoServico}
        </div>

        <SectionTitle>Tributos Federais</SectionTitle>
        <div className="grid grid-cols-5 border-b border-gray-500 text-center">
          {['PIS (R$)', 'COFINS (R$)', 'IR (R$)', 'INSS (R$)', 'CSLL (R$)'].map(label => (
            <Row key={label} label={label} value="0,00" className="text-center" />
          ))}
        </div>

        <div className="grid grid-cols-2">
          <div className="border-r border-gray-600">
            <SectionTitle>Detalhamento de Valores - Prestador dos Servicos</SectionTitle>
            <div className="grid grid-cols-[1.6fr_1fr] border-b border-gray-500">
              <Row label="Valor dos Servicos" value={formatCurrency(data.valorServicos)} />
              <Row label="Valor Liquido" value={formatCurrency(data.valorLiquido)} />
            </div>
            <div className="grid grid-cols-[1fr_1fr] border-b border-gray-500">
              <Row label="Natureza da Operacao" value={data.naturezaOperacao} />
              <Row label="Regime Especial" value={data.regimeEspecial} />
            </div>
            <div className="grid grid-cols-[1fr_1fr]">
              <Row label="Opcao Simples Nacional" value={data.simplesNacional} />
              <Row label="Incentivador Cultural" value={data.incentivadorCultural} />
            </div>
          </div>

          <div>
            <SectionTitle>Calculo do ISSQN devido no Municipio</SectionTitle>
            <div className="grid grid-cols-[1.3fr_1fr] border-b border-gray-500">
              <Row label="Base de Calculo" value={formatCurrency(data.baseCalculo)} />
              <Row label="Aliquota %" value={String(data.aliquotaIss.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))} />
            </div>
            <div className="grid grid-cols-[1fr_1fr] border-b border-gray-500">
              <Row label="ISS a reter" value={data.issRetido} />
              <Row label="Valor do ISS" value={formatCurrency(data.valorIss)} />
            </div>
            <div className="grid grid-cols-1">
              <Row label="Valor Liquido da Nota" value={formatCurrency(data.valorLiquido)} />
            </div>
          </div>
        </div>

        <div className="border-t border-gray-600 px-3 py-2">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-600">Avisos</div>
          <div className="mt-1 whitespace-pre-wrap text-[11px] leading-relaxed text-gray-900">{data.avisos}</div>
        </div>
      </div>
    </div>
  )
}
