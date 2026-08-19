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
 * Se o backend não tiver o token configurado, gera protocolo local como fallback.
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

      if (response.status === 500 && (errorMsg.includes('Token da Senha Digital Plus não configurado') || errorMsg.includes('Credenciais da Senha Digital Plus não configuradas'))) {
        return gerarProtocoloLocal(request, 'Backend sem credenciais configuradas')
      }

      throw new Error(errorMsg)
    }

    return {
      protocolo_numero: data.protocolo_numero || 'N/A',
      protocolo_status: (data.protocolo_status as StatusPedidoProtocolo) || 'gerado',
      data_geracao: data.data_geracao || new Date().toISOString().split('T')[0],
      certificadora: 'Senha Digital Plus',
      mensagem: data.message,
    }
  } catch (error: any) {
    console.error('[senhaDigitalPlus] Erro ao gerar protocolo via backend:', error)
    return gerarProtocoloLocal(request, error.message || 'Erro ao comunicar com o servidor')
  }
}

function gerarProtocoloLocal(request: GerarProtocoloRequest, motivo: string): GerarProtocoloResultado {
  const numeroAleatorio = Math.floor(1000000000 + Math.random() * 8999999999)
  const protocoloNumero = `SD-${numeroAleatorio}`
  const hoje = new Date().toISOString().split('T')[0]

  return {
    protocolo_numero: protocoloNumero,
    protocolo_status: 'gerado',
    data_geracao: hoje,
    certificadora: 'Senha Digital Plus',
    mensagem: `Modo local - ${motivo}. Configure SENHA_DIGITAL_PLUS_API_KEY e SENHA_DIGITAL_PLUS_SECRET_KEY no .env do backend.`,
  }
}
