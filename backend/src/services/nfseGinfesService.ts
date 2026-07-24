import { randomBytes } from 'node:crypto'
import { execSync } from 'node:child_process'
import { writeFileSync, readFileSync, unlinkSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import * as https from 'node:https'
import type { Agent } from 'node:https'
import type { CatalogRepository } from '../repositories/catalogRepository.js'

type HttpFetch = typeof fetch

export type GinfesConfig = {
  wsdlUrl: string
  cnpjPrestador: string
  inscricaoMunicipal: string
  codigoMunicipio: string
  naturezaOperacao: string
  regimeEspecial: string | null
  simplesNacional: boolean
  incentivoFiscal: boolean
  tipoRps: string
  serieRps: string
  numeroRpsAtual: number
  codigoServicoMunicipio: string
  codigoTributacaoMunicipio: string
  cnae: string | null
  aliquotaIss: number
  certificadoPfxPath: string
  certificadoSenha: string
}

export type GinfesRps = {
  numero: number
  serie: string
  tipo: number
  dataEmissao: string
  naturezaOperacao: string
  regimeEspecialTributacao: number
  optanteSimplesNacional: number
  incentivadorCultural: number
  status: number
  servico: {
    valorServicos: number
    valorDeducoes: number
    valorPis: number
    valorCofins: number
    valorInss: number
    valorIr: number
    valorCsll: number
    issRetido: number
    valorIss: number
    valorIssRetido: number
    outrasRetencoes: number
    baseCalculo: number
    aliquota: number
    valorLiquidoNfse: number
    descontoIncondicionado: number
    descontoCondicionado: number
    itemListaServico: string
    codigoCnae: string
    codigoTributacaoMunicipio: string
    discriminacao: string
    codigoMunicipio: string
  }
  prestador: {
    cnpj: string
    inscricaoMunicipal: string
  }
  tomador: {
    cpfCnpj: { cnpj?: string; cpf?: string }
    inscricaoMunicipal: string
    razaoSocial: string
    endereco: {
      endereco: string
      numero: string
      complemento: string
      bairro: string
      codigoMunicipio: string
      uf: string
      cep: string
    }
    contato: {
      telefone: string
      email: string
    }
  }
}

export type GinfesResult = {
  ok: boolean
  protocolo?: string
  numeroLote?: string
  numeroNf?: string
  codigoVerificacao?: string
  statusLote?: number
  error?: string
  mensagens?: Array<{ codigo: string; mensagem: string; correcao: string }>
  rawResponse?: string
}

function extractCertFromPfx(pfxBuffer: Buffer, passphrase: string): { certPem: string; keyPem: string } {
  const id = randomBytes(8).toString('hex')
  const pfxPath = join(tmpdir(), `cert_${id}.pfx`)
  const certPath = join(tmpdir(), `cert_${id}.pem`)
  const keyPath = join(tmpdir(), `key_${id}.pem`)

  try {
    writeFileSync(pfxPath, pfxBuffer)
    execSync(`openssl pkcs12 -in "${pfxPath}" -clcerts -nokeys -out "${certPath}" -passin pass:${passphrase} -legacy 2>/dev/null || openssl pkcs12 -in "${pfxPath}" -clcerts -nokeys -out "${certPath}" -passin pass:${passphrase}`, { stdio: 'pipe' })
    execSync(`openssl pkcs12 -in "${pfxPath}" -nocerts -nodes -out "${keyPath}" -passin pass:${passphrase} -legacy 2>/dev/null || openssl pkcs12 -in "${pfxPath}" -nocerts -nodes -out "${keyPath}" -passin pass:${passphrase}`, { stdio: 'pipe' })
    const certPem = readFileSync(certPath, 'utf-8')
    const keyPem = readFileSync(keyPath, 'utf-8')
    return { certPem, keyPem }
  } finally {
    for (const f of [pfxPath, certPath, keyPath]) {
      try { if (existsSync(f)) unlinkSync(f) } catch {}
    }
  }
}

function createMtlsAgent(pfxBuffer: Buffer, password: string): Agent {
  const { certPem, keyPem } = extractCertFromPfx(pfxBuffer, password)
  return new https.Agent({
    cert: certPem,
    key: keyPem,
    rejectUnauthorized: false,
  })
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

function formatDate(isoDate: string): string {
  return isoDate.replace(/\.\d{3}Z$/, '').replace('Z', '')
}

function buildEnviarLoteRpsXml(config: GinfesConfig, rps: GinfesRps): string {
  const loteId = `lote${config.numeroRpsAtual}`
  const rpsId = `rps${rps.numero}`

  return `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <ns1:RecepcionarLoteRpsV3 xmlns:ns1="http://www.ginfes.com.br/">
      <Cabecalho>
        <versaoDados>3</versaoDados>
      </Cabecalho>
      <EnviarLoteRpsEnvio xmlns="http://www.ginfes.com.br/servico_enviar_lote_rps_envio_v03.xsd"
                          xmlns:tipos="http://www.ginfes.com.br/tipos_v03.xsd">
        <LoteRps Id="${escapeXml(loteId)}">
          <tipos:NumeroLote>${config.numeroRpsAtual}</tipos:NumeroLote>
          <tipos:Cnpj>${escapeXml(config.cnpjPrestador)}</tipos:Cnpj>
          <tipos:InscricaoMunicipal>${escapeXml(config.inscricaoMunicipal)}</tipos:InscricaoMunicipal>
          <tipos:QuantidadeRps>1</tipos:QuantidadeRps>
          <ListaRps xmlns="http://www.ginfes.com.br/tipos_v03.xsd">
            <Rps>
              <InfRps Id="${escapeXml(rpsId)}">
                <IdentificacaoRps>
                  <Numero>${rps.numero}</Numero>
                  <Serie>${escapeXml(rps.serie)}</Serie>
                  <Tipo>${rps.tipo}</Tipo>
                </IdentificacaoRps>
                <DataEmissao>${escapeXml(rps.dataEmissao)}</DataEmissao>
                <NaturezaOperacao>${escapeXml(rps.naturezaOperacao)}</NaturezaOperacao>
                ${rps.regimeEspecialTributacao ? `<RegimeEspecialTributacao>${rps.regimeEspecialTributacao}</RegimeEspecialTributacao>` : ''}
                <OptanteSimplesNacional>${rps.optanteSimplesNacional}</OptanteSimplesNacional>
                <IncentivadorCultural>${rps.incentivadorCultural}</IncentivadorCultural>
                <Status>${rps.status}</Status>
                <Servico>
                  <Valores>
                    <ValorServicos>${rps.servico.valorServicos.toFixed(2)}</ValorServicos>
                    <ValorDeducoes>${rps.servico.valorDeducoes.toFixed(2)}</ValorDeducoes>
                    <ValorPis>${rps.servico.valorPis.toFixed(2)}</ValorPis>
                    <ValorCofins>${rps.servico.valorCofins.toFixed(2)}</ValorCofins>
                    <ValorInss>${rps.servico.valorInss.toFixed(2)}</ValorInss>
                    <ValorIr>${rps.servico.valorIr.toFixed(2)}</ValorIr>
                    <ValorCsll>${rps.servico.valorCsll.toFixed(2)}</ValorCsll>
                    <IssRetido>${rps.servico.issRetido}</IssRetido>
                    <ValorIss>${rps.servico.valorIss.toFixed(2)}</ValorIss>
                    <ValorIssRetido>${rps.servico.valorIssRetido.toFixed(2)}</ValorIssRetido>
                    <OutrasRetencoes>${rps.servico.outrasRetencoes.toFixed(2)}</OutrasRetencoes>
                    <BaseCalculo>${rps.servico.baseCalculo.toFixed(2)}</BaseCalculo>
                    <Aliquota>${rps.servico.aliquota.toFixed(2)}</Aliquota>
                    <ValorLiquidoNfse>${rps.servico.valorLiquidoNfse.toFixed(2)}</ValorLiquidoNfse>
                    <DescontoIncondicionado>${rps.servico.descontoIncondicionado.toFixed(2)}</DescontoIncondicionado>
                    <DescontoCondicionado>${rps.servico.descontoCondicionado.toFixed(2)}</DescontoCondicionado>
                  </Valores>
                  <ItemListaServico>${escapeXml(rps.servico.itemListaServico)}</ItemListaServico>
                  ${rps.servico.codigoCnae ? `<CodigoCnae>${escapeXml(rps.servico.codigoCnae)}</CodigoCnae>` : ''}
                  <CodigoTributacaoMunicipio>${escapeXml(rps.servico.codigoTributacaoMunicipio)}</CodigoTributacaoMunicipio>
                  <Discriminacao>${escapeXml(rps.servico.discriminacao)}</Discriminacao>
                  <CodigoMunicipio>${escapeXml(rps.servico.codigoMunicipio)}</CodigoMunicipio>
                </Servico>
                <Prestador>
                  <Cnpj>${escapeXml(rps.prestador.cnpj)}</Cnpj>
                  <InscricaoMunicipal>${escapeXml(rps.prestador.inscricaoMunicipal)}</InscricaoMunicipal>
                </Prestador>
                <Tomador>
                  <IdentificacaoTomador>
                    <CpfCnpj>
                      ${rps.tomador.cpfCnpj.cnpj ? `<Cnpj>${escapeXml(rps.tomador.cpfCnpj.cnpj)}</Cnpj>` : `<Cpf>${escapeXml(rps.tomador.cpfCnpj.cpf ?? '')}</Cpf>`}
                    </CpfCnpj>
                    ${rps.tomador.inscricaoMunicipal ? `<InscricaoMunicipal>${escapeXml(rps.tomador.inscricaoMunicipal)}</InscricaoMunicipal>` : ''}
                  </IdentificacaoTomador>
                  <RazaoSocial>${escapeXml(rps.tomador.razaoSocial)}</RazaoSocial>
                  <Endereco>
                    <Endereco>${escapeXml(rps.tomador.endereco.endereco)}</Endereco>
                    <Numero>${escapeXml(rps.tomador.endereco.numero)}</Numero>
                    ${rps.tomador.endereco.complemento ? `<Complemento>${escapeXml(rps.tomador.endereco.complemento)}</Complemento>` : ''}
                    <Bairro>${escapeXml(rps.tomador.endereco.bairro)}</Bairro>
                    <CodigoMunicipio>${escapeXml(rps.tomador.endereco.codigoMunicipio)}</CodigoMunicipio>
                    <Uf>${escapeXml(rps.tomador.endereco.uf)}</Uf>
                    <Cep>${escapeXml(rps.tomador.endereco.cep)}</Cep>
                  </Endereco>
                  <Contato>
                    <Telefone>${escapeXml(rps.tomador.contato.telefone)}</Telefone>
                    <Email>${escapeXml(rps.tomador.contato.email)}</Email>
                  </Contato>
                </Tomador>
              </InfRps>
            </Rps>
          </ListaRps>
        </LoteRps>
      </EnviarLoteRpsEnvio>
    </ns1:RecepcionarLoteRpsV3>
  </soap:Body>
</soap:Envelope>`
}

function buildConsultarSituacaoLoteXml(cnpj: string, im: string, protocolo: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <ns1:ConsultarSituacaoLoteRpsV3 xmlns:ns1="http://www.ginfes.com.br/">
      <Cabecalho>
        <versaoDados>3</versaoDados>
      </Cabecalho>
      <ConsultarSituacaoLoteRpsEnvio xmlns="http://www.ginfes.com.br/servico_consultar_situacao_lote_rps_envio_v03.xsd"
                                     xmlns:tipos="http://www.ginfes.com.br/tipos_v03.xsd">
        <Prestador>
          <tipos:Cnpj>${escapeXml(cnpj)}</tipos:Cnpj>
          <tipos:InscricaoMunicipal>${escapeXml(im)}</tipos:InscricaoMunicipal>
        </Prestador>
        <Protocolo>${escapeXml(protocolo)}</Protocolo>
      </ConsultarSituacaoLoteRpsEnvio>
    </ns1:ConsultarSituacaoLoteRpsV3>
  </soap:Body>
</soap:Envelope>`
}

function buildConsultarLoteRpsXml(cnpj: string, im: string, protocolo: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <ns1:ConsultarLoteRpsV3 xmlns:ns1="http://www.ginfes.com.br/">
      <Cabecalho>
        <versaoDados>3</versaoDados>
      </Cabecalho>
      <ConsultarLoteRpsEnvio xmlns="http://www.ginfes.com.br/servico_consultar_lote_rps_envio_v03.xsd"
                             xmlns:tipos="http://www.ginfes.com.br/tipos_v03.xsd">
        <Prestador>
          <tipos:Cnpj>${escapeXml(cnpj)}</tipos:Cnpj>
          <tipos:InscricaoMunicipal>${escapeXml(im)}</tipos:InscricaoMunicipal>
        </Prestador>
        <Protocolo>${escapeXml(protocolo)}</Protocolo>
      </ConsultarLoteRpsEnvio>
    </ns1:ConsultarLoteRpsV3>
  </soap:Body>
</soap:Envelope>`
}

function buildConsultarNfsePorRpsXml(numeroRps: number, serie: string, tipo: number, cnpj: string, im: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <ns1:ConsultarNfsePorRpsV3 xmlns:ns1="http://www.ginfes.com.br/">
      <Cabecalho>
        <versaoDados>3</versaoDados>
      </Cabecalho>
      <ConsultarNfseRpsEnvio xmlns="http://www.ginfes.com.br/servico_consultar_nfse_rps_envio_v03.xsd"
                             xmlns:tipos="http://www.ginfes.com.br/tipos_v03.xsd">
        <IdentificacaoRps>
          <tipos:Numero>${numeroRps}</tipos:Numero>
          <tipos:Serie>${escapeXml(serie)}</tipos:Serie>
          <tipos:Tipo>${tipo}</tipos:Tipo>
        </IdentificacaoRps>
        <Prestador>
          <tipos:Cnpj>${escapeXml(cnpj)}</tipos:Cnpj>
          <tipos:InscricaoMunicipal>${escapeXml(im)}</tipos:InscricaoMunicipal>
        </Prestador>
      </ConsultarNfseRpsEnvio>
    </ns1:ConsultarNfsePorRpsV3>
  </soap:Body>
</soap:Envelope>`
}

function parseMensagensRetorno(xml: string): Array<{ codigo: string; mensagem: string; correcao: string }> {
  const mensagens: Array<{ codigo: string; mensagem: string; correcao: string }> = []
  const msgRegex = /<MensagemRetorno>([\s\S]*?)<\/MensagemRetorno>/g
  let match = msgRegex.exec(xml)
  while (match) {
    const block = match[1]
    const codigo = extractTag(block, 'Codigo')
    const mensagem = extractTag(block, 'Mensagem')
    const correcao = extractTag(block, 'Correcao')
    if (codigo || mensagem) {
      mensagens.push({ codigo: codigo || '', mensagem: mensagem || '', correcao: correcao || '' })
    }
    match = msgRegex.exec(xml)
  }
  return mensagens
}

function extractTag(xml: string, tag: string): string {
  const regex = new RegExp(`<${tag}>([^<]*)<\\/${tag}>`)
  const match = regex.exec(xml)
  return match?.[1]?.trim() ?? ''
}

async function sendSoapRequest(wsdlUrl: string, soapBody: string, agent: Agent): Promise<string> {
  const endpoint = wsdlUrl.replace(/\?wsdl$/i, '').replace(/\/$/, '')
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      SOAPAction: '""',
    },
    body: soapBody,
    // @ts-expect-error -- Node.js fetch supports dispatcher for mTLS
    dispatcher: agent,
    signal: AbortSignal.timeout(60000),
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`HTTP ${response.status}: ${text.slice(0, 500)}`)
  }

  return response.text()
}

async function sendSoapRequestWithNodeHttps(wsdlUrl: string, soapBody: string, agent: Agent): Promise<string> {
  const endpoint = wsdlUrl.replace(/\?wsdl$/i, '').replace(/\/$/, '')
  const url = new URL(endpoint)

  return new Promise<string>((resolve, reject) => {
    const req = https.request({
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        SOAPAction: '""',
        'Content-Length': Buffer.byteLength(soapBody),
      },
      agent,
      timeout: 60000,
    }, (res) => {
      let data = ''
      res.on('data', (chunk: Buffer) => { data += chunk.toString() })
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 500)}`))
          return
        }
        resolve(data)
      })
    })

    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('SOAP request timeout')) })
    req.write(soapBody)
    req.end()
  })
}

async function sendSoap(wsdlUrl: string, soapBody: string, agent: Agent): Promise<string> {
  try {
    return await sendSoapRequest(wsdlUrl, soapBody, agent)
  } catch {
    return await sendSoapRequestWithNodeHttps(wsdlUrl, soapBody, agent)
  }
}

export async function enviarLoteRps(config: GinfesConfig, rps: GinfesRps, pfxBuffer: Buffer): Promise<GinfesResult> {
  const agent = createMtlsAgent(pfxBuffer, config.certificadoSenha)
  const xml = buildEnviarLoteRpsXml(config, rps)

  try {
    const response = await sendSoap(config.wsdlUrl, xml, agent)
    const mensagens = parseMensagensRetorno(response)

    if (mensagens.length > 0) {
      return { ok: false, mensagens, rawResponse: response, error: mensagens.map(m => `${m.codigo}: ${m.mensagem}`).join('; ') }
    }

    const protocolo = extractTag(response, 'Protocolo')
    const numeroLote = extractTag(response, 'NumeroLote')

    if (!protocolo) {
      return { ok: false, error: 'Resposta sem protocolo', rawResponse: response }
    }

    return { ok: true, protocolo, numeroLote }
  } finally {
    agent.destroy()
  }
}

export async function consultarSituacaoLote(config: GinfesConfig, protocolo: string, pfxBuffer: Buffer): Promise<GinfesResult> {
  const agent = createMtlsAgent(pfxBuffer, config.certificadoSenha)
  const xml = buildConsultarSituacaoLoteXml(config.cnpjPrestador, config.inscricaoMunicipal, protocolo)

  try {
    const response = await sendSoap(config.wsdlUrl, xml, agent)
    const mensagens = parseMensagensRetorno(response)
    if (mensagens.length > 0) {
      return { ok: false, mensagens, rawResponse: response, error: mensagens.map(m => `${m.codigo}: ${m.mensagem}`).join('; ') }
    }

    const situacao = Number(extractTag(response, 'Situacao') || '0')
    return { ok: true, statusLote: situacao, rawResponse: response }
  } finally {
    agent.destroy()
  }
}

export async function consultarLoteRps(config: GinfesConfig, protocolo: string, pfxBuffer: Buffer): Promise<GinfesResult> {
  const agent = createMtlsAgent(pfxBuffer, config.certificadoSenha)
  const xml = buildConsultarLoteRpsXml(config.cnpjPrestador, config.inscricaoMunicipal, protocolo)

  try {
    const response = await sendSoap(config.wsdlUrl, xml, agent)
    const mensagens = parseMensagensRetorno(response)
    if (mensagens.length > 0) {
      return { ok: false, mensagens, rawResponse: response, error: mensagens.map(m => `${m.codigo}: ${m.mensagem}`).join('; ') }
    }

    const numeroNf = extractTag(response, 'Numero')
    const codigoVerificacao = extractTag(response, 'CodigoVerificacao')

    return {
      ok: true,
      numeroNf: numeroNf || undefined,
      codigoVerificacao: codigoVerificacao || undefined,
      rawResponse: response,
    }
  } finally {
    agent.destroy()
  }
}

export async function emitirNFSeGinfes(
  repo: CatalogRepository,
  vendaId: string,
): Promise<GinfesResult> {
  const config = await repo.getActiveNfseConfiguracao()
  if (!config) return { ok: false, error: 'Nenhuma configuracao fiscal ativa encontrada.' }

  const payload = (config.payload_reforma_tributaria ?? {}) as Record<string, unknown>
  const wsdlUrl = String(payload.ginfes_wsdl_homologacao ?? payload.gissonline_wsdl_url ?? '').trim()
  if (!wsdlUrl) return { ok: false, error: 'WSDL do GINFES nao configurado.' }

  const pfxPath = String(config.certificado_pfx_path ?? '').trim()
  const certSenha = String(config.certificado_senha ?? '').trim()
  if (!pfxPath) return { ok: false, error: 'Caminho do certificado A1 nao configurado.' }
  if (!certSenha) return { ok: false, error: 'Senha do certificado A1 nao configurada.' }

  const absPfxPath = pfxPath.startsWith('/') ? pfxPath : join('/opt/avmd/AVMD_System/storage', pfxPath)
  if (!existsSync(absPfxPath)) return { ok: false, error: `Certificado A1 nao encontrado em ${absPfxPath}.` }
  const pfxBuffer = readFileSync(absPfxPath)

  const venda = await repo.getNfseVendaContext(vendaId)
  if (!venda) return { ok: false, error: 'Venda nao encontrada.' }

  const numeroRps = (config.numero_rps_atual ?? 1)
  const agora = new Date()
  const dataEmissao = formatDate(agora.toISOString())

  const doc = String(venda.documento_faturamento ?? '').replace(/\D/g, '')
  const isCnpj = doc.length === 14
  const rps: GinfesRps = {
    numero: numeroRps,
    serie: config.serie_rps ?? '1',
    tipo: Number(config.tipo_rps ?? 1),
    dataEmissao,
    naturezaOperacao: config.natureza_operacao ?? '1',
    regimeEspecialTributacao: Number(config.regime_especial ?? 0) || 0,
    optanteSimplesNacional: config.simples_nacional ? 1 : 2,
    incentivadorCultural: config.incentivo_fiscal ? 1 : 2,
    status: 1,
    servico: {
      valorServicos: Number(venda.valor_venda ?? 0),
      valorDeducoes: 0,
      valorPis: 0,
      valorCofins: 0,
      valorInss: 0,
      valorIr: 0,
      valorCsll: 0,
      issRetido: venda.iss_retido ? 1 : 2,
      valorIss: Number(venda.valor_venda ?? 0) * Number(config.aliquota_iss ?? 0) / 100,
      valorIssRetido: 0,
      outrasRetencoes: 0,
      baseCalculo: Number(venda.valor_venda ?? 0),
      aliquota: Number(config.aliquota_iss ?? 0),
      valorLiquidoNfse: Number(venda.valor_venda ?? 0),
      descontoIncondicionado: 0,
      descontoCondicionado: 0,
      itemListaServico: config.codigo_servico_municipio ?? '',
      codigoCnae: config.cnae ?? '',
      codigoTributacaoMunicipio: config.codigo_tributacao_municipio ?? '',
      discriminacao: String(venda.observacoes ?? `Servico de certificado digital - venda ${vendaId.slice(0, 8)}`),
      codigoMunicipio: config.municipio_codigo_ibge ?? '',
    },
    prestador: {
      cnpj: config.cnpj_emitente ?? '',
      inscricaoMunicipal: config.inscricao_municipal ?? '',
    },
    tomador: {
      cpfCnpj: isCnpj ? { cnpj: doc } : { cpf: doc },
      inscricaoMunicipal: venda.inscricao_municipal ?? '',
      razaoSocial: venda.nome_faturamento ?? '',
      endereco: {
        endereco: venda.logradouro ?? '',
        numero: venda.numero ?? 's/n',
        complemento: venda.complemento ?? '',
        bairro: venda.bairro ?? '',
        codigoMunicipio: config.municipio_codigo_ibge ?? '',
        uf: venda.uf ?? '',
        cep: (venda.cep ?? '').replace(/\D/g, ''),
      },
      contato: {
        telefone: (venda.telefone_faturamento ?? '').replace(/\D/g, ''),
        email: venda.email_faturamento ?? '',
      },
    },
  }

  const result = await enviarLoteRps(
    { ...config, wsdlUrl, certificadoPfxPath: absPfxPath, certificadoSenha: certSenha } as GinfesConfig,
    rps,
    pfxBuffer,
  )

  if (result.ok && result.protocolo) {
    await repo.createNfse({
      venda_certificado_id: vendaId,
      cadastro_base_tomador_id: venda.cadastro_base_id ?? null,
      numero_nf: null,
      codigo_verificacao: null,
      status_nf: 'enviado',
      data_emissao: agora.toISOString(),
      valor_servico: venda.valor_venda ?? 0,
      valor_iss: rps.servico.valorIss,
      payload_envio: { modo: 'ginfes', rps, protocolo: result.protocolo, numero_lote: result.numeroLote },
      payload_retorno: {},
      metadata: { ginfes_wsdl: wsdlUrl, numero_rps: numeroRps },
    })

    await repo.updateNfseConfigRpsNumber(config.id, numeroRps + 1)

    const pollingResult = await pollLoteRps(config, result.protocolo, pfxBuffer)
    if (pollingResult.ok && pollingResult.numeroNf) {
      const notaId = await repo.updateNfseStatusByProtocolo(result.protocolo, {
        numero_nf: pollingResult.numeroNf,
        codigo_verificacao: pollingResult.codigoVerificacao ?? null,
        status_nf: 'processado',
      })
      return { ...result, numeroNf: pollingResult.numeroNf, codigoVerificacao: pollingResult.codigoVerificacao }
    }

    return { ...result, message: `Lote enviado. Protocolo: ${result.protocolo}. Aguardando processamento na prefeitura.` }
  }

  return result
}

async function pollLoteRps(config: GinfesConfig, protocolo: string, pfxBuffer: Buffer, maxAttempts = 12, intervalMs = 10000): Promise<GinfesResult> {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(resolve => setTimeout(resolve, intervalMs))

    const situacao = await consultarSituacaoLote(config, protocolo, pfxBuffer)
    if (!situacao.ok) return situacao

    if (situacao.statusLote === 4) {
      return await consultarLoteRps(config, protocolo, pfxBuffer)
    }

    if (situacao.statusLote === 3 || situacao.statusLote === 5) {
      return { ok: false, error: `Lote processado com erro (status: ${situacao.statusLote})`, statusLote: situacao.statusLote, rawResponse: situacao.rawResponse }
    }

    if (situacao.statusLote === 1) {
      return { ok: false, error: 'Lote nao recebido pela prefeitura.', statusLote: situacao.statusLote }
    }
  }

  return { ok: true, protocolo, message: `Lote em processamento. Consulte o protocolo ${protocolo} na prefeitura.` }
}
