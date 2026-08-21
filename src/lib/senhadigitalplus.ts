import { getApiUrl } from '@/lib/api'

export interface GerarProtocoloRequest {
  cliente_id: string
  cpf_cnpj: string
  nome_titular: string
  tipo_documento: 'cpf' | 'cnpj'
  tipo_certificado: string
  observacoes?: string
}

export interface GerarProtocoloResultado {
  protocolo_numero: string
  protocolo_status: StatusPedidoProtocolo
  data_geracao: string
  certificadora: string
  mensagem?: string
}

export type StatusPedidoProtocolo = 'nao_gerado' | 'pendente' | 'gerado' | 'erro' | 'cancelado'

/**
 * Gera um protocolo chamando o backend (que por sua vez chama a API Senha Digital Plus).
 * A chave da API fica segura no servidor, nunca no navegador.
 *
 * Falhas nunca geram protocolo local: somente a certificadora pode confirmar a emissão.
 */
export async function gerarProtocoloSenhaDigitalPlus(
  request: GerarProtocoloRequest
): Promise<GerarProtocoloResultado> {
  try {
    const url = getApiUrl('/protocolos/gerar')

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cliente_id: request.cliente_id,
        cpf_cnpj: request.cpf_cnpj,
        nome_titular: request.nome_titular,
        tipo_documento: request.tipo_documento,
        tipo_certificado: request.tipo_certificado,
        observacoes: request.observacoes,
      }),
    })

    const data = await response.json().catch(() => null) as {
      ok?: boolean
      error?: string
      protocolo_numero?: string
      protocolo_status?: string
      data_geracao?: string
      message?: string
    } | null

    if (!response.ok || !data?.ok) {
      const errorMsg = data?.error || data?.message || `Erro HTTP ${response.status}`

      throw new Error(errorMsg)
    }

    return {
      protocolo_numero: data.protocolo_numero || 'N/A',
      protocolo_status: (data.protocolo_status as StatusPedidoProtocolo) || 'gerado',
      data_geracao: data.data_geracao || new Date().toISOString().split('T')[0],
      certificadora: 'Senha Digital Plus',
      mensagem: data.message,
    }
  } catch (error: unknown) {
    console.error('[senhaDigitalPlus] Erro ao gerar protocolo via backend:', error)
    throw error instanceof Error ? error : new Error('Erro ao comunicar com o servidor')
  }
}
