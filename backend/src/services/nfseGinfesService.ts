import { randomBytes } from 'node:crypto'
import { execSync } from 'node:child_process'
import { writeFileSync, readFileSync, unlinkSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import * as https from 'node:https'
import type { Agent } from 'node:https'
import { SignedXml } from 'xml-crypto'
import type { CatalogRepository } from '../repositories/catalogRepository.js'

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
  message?: string
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
      try { if (existsSync(f)) unlinkSync(f) } catch { /* limpeza temporária em melhor esforço */ }
    }
  }
}

function createMtlsAgent(pfxBuffer: Buffer, password: string): Agent {
  const { certPem, keyPem } = extractCertFromPfx(pfxBuffer, password)
  return new https.Agent({
    cert: certPem,
    key: keyPem,
    rejectUnauthorized: true,
  })
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

function escapeXmlForParam(s: string): string {
  return escapeXml(s)
}

function formatDate(isoDate: string): string {
  return isoDate.replace(/\.\d{3}Z$/, '').replace('Z', '')
}

function formatDateForSaoPaulo(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${value.year}-${value.month}-${value.day}T${value.hour}:${value.minute}:${value.second}`
}

function buildCabecalhoXml(): string {
  return `<cab:cabecalho xmlns:cab="http://www.ginfes.com.br/cabecalho_v03.xsd" versao="3"><versaoDados>3</versaoDados></cab:cabecalho>`
}

function signXmlElement(xml: string, xpath: string, certPem: string, keyPem: string): string {
  const signer = new SignedXml({
    privateKey: keyPem,
    publicCert: certPem,
    canonicalizationAlgorithm: 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315',
    signatureAlgorithm: 'http://www.w3.org/2000/09/xmldsig#rsa-sha1',
  })
  signer.addReference({
    xpath,
    digestAlgorithm: 'http://www.w3.org/2000/09/xmldsig#sha1',
    transforms: [
      'http://www.w3.org/2000/09/xmldsig#enveloped-signature',
      'http://www.w3.org/TR/2001/REC-xml-c14n-20010315',
    ],
  })
  signer.computeSignature(xml, {
    location: { reference: xpath, action: 'after' },
  })
  return signer.getSignedXml()
}

function signXmlRoot(xml: string, xpath: string, certPem: string, keyPem: string): string {
  const signer = new SignedXml({
    privateKey: keyPem,
    publicCert: certPem,
    canonicalizationAlgorithm: 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315',
    signatureAlgorithm: 'http://www.w3.org/2000/09/xmldsig#rsa-sha1',
  })
  signer.addReference({
    xpath,
    isEmptyUri: true,
    digestAlgorithm: 'http://www.w3.org/2000/09/xmldsig#sha1',
    transforms: [
      'http://www.w3.org/2000/09/xmldsig#enveloped-signature',
      'http://www.w3.org/TR/2001/REC-xml-c14n-20010315',
    ],
  })
  signer.computeSignature(xml, {
    location: { reference: xpath, action: 'append' },
  })
  return signer.getSignedXml()
}

function buildEnviarLoteRpsInnerXml(config: GinfesConfig, rps: GinfesRps, certPem: string, keyPem: string): string {
  const loteId = `lote${config.numeroRpsAtual}`
  const rpsId = `rps${rps.numero}`

  const unsigned = `<EnviarLoteRpsEnvio xmlns="http://www.ginfes.com.br/servico_enviar_lote_rps_envio_v03.xsd" xmlns:tipos="http://www.ginfes.com.br/tipos_v03.xsd"><LoteRps Id="${escapeXml(loteId)}"><tipos:NumeroLote>${config.numeroRpsAtual}</tipos:NumeroLote><tipos:Cnpj>${escapeXml(config.cnpjPrestador)}</tipos:Cnpj><tipos:InscricaoMunicipal>${escapeXml(config.inscricaoMunicipal)}</tipos:InscricaoMunicipal><tipos:QuantidadeRps>1</tipos:QuantidadeRps><ListaRps xmlns="http://www.ginfes.com.br/tipos_v03.xsd"><Rps><InfRps Id="${escapeXml(rpsId)}"><IdentificacaoRps><Numero>${rps.numero}</Numero><Serie>${escapeXml(rps.serie)}</Serie><Tipo>${rps.tipo}</Tipo></IdentificacaoRps><DataEmissao>${escapeXml(rps.dataEmissao)}</DataEmissao><NaturezaOperacao>${escapeXml(rps.naturezaOperacao)}</NaturezaOperacao>${rps.regimeEspecialTributacao ? `<RegimeEspecialTributacao>${rps.regimeEspecialTributacao}</RegimeEspecialTributacao>` : ''}<OptanteSimplesNacional>${rps.optanteSimplesNacional}</OptanteSimplesNacional><IncentivadorCultural>${rps.incentivadorCultural}</IncentivadorCultural><Status>${rps.status}</Status><Servico><Valores><ValorServicos>${rps.servico.valorServicos.toFixed(2)}</ValorServicos><ValorDeducoes>${rps.servico.valorDeducoes.toFixed(2)}</ValorDeducoes><ValorPis>${rps.servico.valorPis.toFixed(2)}</ValorPis><ValorCofins>${rps.servico.valorCofins.toFixed(2)}</ValorCofins><ValorInss>${rps.servico.valorInss.toFixed(2)}</ValorInss><ValorIr>${rps.servico.valorIr.toFixed(2)}</ValorIr><ValorCsll>${rps.servico.valorCsll.toFixed(2)}</ValorCsll><IssRetido>${rps.servico.issRetido}</IssRetido><ValorIss>${rps.servico.valorIss.toFixed(2)}</ValorIss>${rps.servico.issRetido === 1 ? `<ValorIssRetido>${rps.servico.valorIssRetido.toFixed(2)}</ValorIssRetido>` : ''}<OutrasRetencoes>${rps.servico.outrasRetencoes.toFixed(2)}</OutrasRetencoes><BaseCalculo>${rps.servico.baseCalculo.toFixed(2)}</BaseCalculo><Aliquota>${(rps.servico.aliquota / 100).toFixed(2)}</Aliquota><ValorLiquidoNfse>${rps.servico.valorLiquidoNfse.toFixed(2)}</ValorLiquidoNfse></Valores><ItemListaServico>${escapeXml(rps.servico.itemListaServico)}</ItemListaServico><CodigoTributacaoMunicipio>${escapeXml(rps.servico.codigoTributacaoMunicipio)}</CodigoTributacaoMunicipio><Discriminacao>${escapeXml(rps.servico.discriminacao)}</Discriminacao><CodigoMunicipio>${escapeXml(rps.servico.codigoMunicipio)}</CodigoMunicipio></Servico><Prestador><Cnpj>${escapeXml(rps.prestador.cnpj)}</Cnpj><InscricaoMunicipal>${escapeXml(rps.prestador.inscricaoMunicipal)}</InscricaoMunicipal></Prestador><Tomador><IdentificacaoTomador><CpfCnpj>${rps.tomador.cpfCnpj.cnpj ? `<Cnpj>${escapeXml(rps.tomador.cpfCnpj.cnpj)}</Cnpj>` : `<Cpf>${escapeXml(rps.tomador.cpfCnpj.cpf ?? '')}</Cpf>`}</CpfCnpj>${rps.tomador.inscricaoMunicipal ? `<InscricaoMunicipal>${escapeXml(rps.tomador.inscricaoMunicipal)}</InscricaoMunicipal>` : ''}</IdentificacaoTomador><RazaoSocial>${escapeXml(rps.tomador.razaoSocial)}</RazaoSocial><Endereco><Endereco>${escapeXml(rps.tomador.endereco.endereco)}</Endereco><Numero>${escapeXml(rps.tomador.endereco.numero)}</Numero>${rps.tomador.endereco.complemento ? `<Complemento>${escapeXml(rps.tomador.endereco.complemento)}</Complemento>` : ''}<Bairro>${escapeXml(rps.tomador.endereco.bairro)}</Bairro><CodigoMunicipio>${escapeXml(rps.tomador.endereco.codigoMunicipio)}</CodigoMunicipio><Uf>${escapeXml(rps.tomador.endereco.uf)}</Uf><Cep>${escapeXml(rps.tomador.endereco.cep)}</Cep></Endereco><Contato><Telefone>${escapeXml(rps.tomador.contato.telefone)}</Telefone><Email>${escapeXml(rps.tomador.contato.email)}</Email></Contato></Tomador></InfRps></Rps></ListaRps></LoteRps></EnviarLoteRpsEnvio>`
  const signedRps = signXmlElement(unsigned, "//*[local-name()='InfRps']", certPem, keyPem)
  return signXmlElement(signedRps, "//*[local-name()='LoteRps']", certPem, keyPem)
}

export function construirLoteRpsAssinado(
  config: GinfesConfig,
  rps: GinfesRps,
  pfxBuffer: Buffer,
): string {
  const { certPem, keyPem } = extractCertFromPfx(pfxBuffer, config.certificadoSenha)
  return buildEnviarLoteRpsInnerXml(config, rps, certPem, keyPem)
}

function soapNamespace(wsdlUrl: string): string {
  return wsdlUrl.toLowerCase().includes('producao.ginfes.com.br')
    ? 'http://producao.ginfes.com.br'
    : 'http://homologacao.ginfes.com.br'
}

function buildEnviarLoteRpsXml(config: GinfesConfig, rps: GinfesRps, certPem: string, keyPem: string): string {
  const cabecalhoXml = buildCabecalhoXml()
  const envioXml = buildEnviarLoteRpsInnerXml(config, rps, certPem, keyPem)
  const namespace = soapNamespace(config.wsdlUrl)

  return `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ns1="${namespace}">
  <soap:Body>
    <ns1:RecepcionarLoteRpsV3>
      <arg0>${cabecalhoXml}</arg0>
      <arg1>${envioXml}</arg1>
    </ns1:RecepcionarLoteRpsV3>
  </soap:Body>
</soap:Envelope>`
}

function buildConsultarSituacaoLoteXml(cnpj: string, im: string, protocolo: string, namespace: string, certPem: string, keyPem: string): string {
  const cabecalhoXml = buildCabecalhoXml()
  const envioXml = signXmlRoot(`<q:ConsultarSituacaoLoteRpsEnvio xmlns:q="http://www.ginfes.com.br/servico_consultar_situacao_lote_rps_envio_v03.xsd" xmlns:tipos="http://www.ginfes.com.br/tipos_v03.xsd"><q:Prestador><tipos:Cnpj>${escapeXml(cnpj)}</tipos:Cnpj><tipos:InscricaoMunicipal>${escapeXml(im)}</tipos:InscricaoMunicipal></q:Prestador><q:Protocolo>${escapeXml(protocolo)}</q:Protocolo></q:ConsultarSituacaoLoteRpsEnvio>`, "//*[local-name()='ConsultarSituacaoLoteRpsEnvio']", certPem, keyPem)

  return `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ns1="${namespace}">
  <soap:Body>
    <ns1:ConsultarSituacaoLoteRpsV3>
      <arg0>${cabecalhoXml}</arg0>
      <arg1>${envioXml}</arg1>
    </ns1:ConsultarSituacaoLoteRpsV3>
  </soap:Body>
</soap:Envelope>`
}

function buildConsultarLoteRpsXml(cnpj: string, im: string, protocolo: string, namespace: string, certPem: string, keyPem: string): string {
  const cabecalhoXml = buildCabecalhoXml()
  const envioXml = signXmlRoot(`<q:ConsultarLoteRpsEnvio xmlns:q="http://www.ginfes.com.br/servico_consultar_lote_rps_envio_v03.xsd" xmlns:tipos="http://www.ginfes.com.br/tipos_v03.xsd"><q:Prestador><tipos:Cnpj>${escapeXml(cnpj)}</tipos:Cnpj><tipos:InscricaoMunicipal>${escapeXml(im)}</tipos:InscricaoMunicipal></q:Prestador><q:Protocolo>${escapeXml(protocolo)}</q:Protocolo></q:ConsultarLoteRpsEnvio>`, "//*[local-name()='ConsultarLoteRpsEnvio']", certPem, keyPem)

  return `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ns1="${namespace}">
  <soap:Body>
    <ns1:ConsultarLoteRpsV3>
      <arg0>${cabecalhoXml}</arg0>
      <arg1>${envioXml}</arg1>
    </ns1:ConsultarLoteRpsV3>
  </soap:Body>
</soap:Envelope>`
}

function buildConsultarNfsePorRpsXml(numeroRps: number, serie: string, tipo: number, cnpj: string, im: string, namespace: string, certPem: string, keyPem: string): string {
  const cabecalhoXml = buildCabecalhoXml()
  const envioXml = signXmlRoot(`<q:ConsultarNfseRpsEnvio xmlns:q="http://www.ginfes.com.br/servico_consultar_nfse_rps_envio_v03.xsd" xmlns:tipos="http://www.ginfes.com.br/tipos_v03.xsd"><q:IdentificacaoRps><tipos:Numero>${numeroRps}</tipos:Numero><tipos:Serie>${escapeXml(serie)}</tipos:Serie><tipos:Tipo>${tipo}</tipos:Tipo></q:IdentificacaoRps><q:Prestador><tipos:Cnpj>${escapeXml(cnpj)}</tipos:Cnpj><tipos:InscricaoMunicipal>${escapeXml(im)}</tipos:InscricaoMunicipal></q:Prestador></q:ConsultarNfseRpsEnvio>`, "//*[local-name()='ConsultarNfseRpsEnvio']", certPem, keyPem)

  return `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ns1="${namespace}">
  <soap:Body>
    <ns1:ConsultarNfsePorRpsV3>
      <arg0>${cabecalhoXml}</arg0>
      <arg1>${envioXml}</arg1>
    </ns1:ConsultarNfsePorRpsV3>
  </soap:Body>
</soap:Envelope>`
}

function buildCancelarNfseXml(
  numeroNfse: string,
  codigoCancelamento: string,
  cnpj: string,
  im: string,
  codigoMunicipio: string,
  namespace: string,
  certPem: string,
  keyPem: string,
): string {
  const cabecalhoXml = buildCabecalhoXml()
  const cancelamentoId = `cancelamento${numeroNfse.replace(/\D/g, '')}`
  const unsigned = `<e:CancelarNfseEnvio xmlns:e="http://www.ginfes.com.br/servico_cancelar_nfse_envio_v03.xsd" xmlns:tipos="http://www.ginfes.com.br/tipos_v03.xsd"><Pedido><tipos:InfPedidoCancelamento Id="${escapeXml(cancelamentoId)}"><tipos:IdentificacaoNfse><tipos:Numero>${escapeXml(numeroNfse)}</tipos:Numero><tipos:Cnpj>${escapeXml(cnpj)}</tipos:Cnpj><tipos:InscricaoMunicipal>${escapeXml(im)}</tipos:InscricaoMunicipal><tipos:CodigoMunicipio>${escapeXml(codigoMunicipio)}</tipos:CodigoMunicipio></tipos:IdentificacaoNfse><tipos:CodigoCancelamento>${escapeXml(codigoCancelamento)}</tipos:CodigoCancelamento></tipos:InfPedidoCancelamento></Pedido></e:CancelarNfseEnvio>`
  const envioXml = signXmlElement(unsigned, "//*[local-name()='InfPedidoCancelamento']", certPem, keyPem)
  const cabecalhoParam = `<?xml version="1.0" encoding="UTF-8"?>${cabecalhoXml}`
  const envioParam = `<?xml version="1.0" encoding="UTF-8"?>${envioXml}`

  return `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ns1="${namespace}">
  <soap:Body>
    <ns1:CancelarNfseV3>
      <arg0>${escapeXmlForParam(cabecalhoParam)}</arg0>
      <arg1>${escapeXmlForParam(envioParam)}</arg1>
    </ns1:CancelarNfseV3>
  </soap:Body>
</soap:Envelope>`
}

function parseMensagensRetorno(xml: string): Array<{ codigo: string; mensagem: string; correcao: string }> {
  const decodedXml = xml
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
  const mensagens: Array<{ codigo: string; mensagem: string; correcao: string }> = []
  const msgRegex = /<(?:\w+:)?MensagemRetorno>([\s\S]*?)<\/(?:\w+:)?MensagemRetorno>/g
  let match = msgRegex.exec(decodedXml)
  while (match) {
    const block = match[1]
    const codigo = extractTag(block, 'Codigo')
    const mensagem = extractTag(block, 'Mensagem')
    const correcao = extractTag(block, 'Correcao')
    if (codigo || mensagem) {
      mensagens.push({ codigo: codigo || '', mensagem: mensagem || '', correcao: correcao || '' })
    }
    match = msgRegex.exec(decodedXml)
  }
  return mensagens
}

function extractTag(xml: string, tag: string): string {
  const decodedXml = xml
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
  const regex = new RegExp(`<(?:\\w+:)?${tag}>([^<]*)<\\/(?:\\w+:)?${tag}>`)
  const match = regex.exec(decodedXml)
  return match?.[1]?.trim() ?? ''
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
      timeout: 30000,
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
  return sendSoapRequestWithNodeHttps(wsdlUrl, soapBody, agent)
}

export async function enviarLoteRps(config: GinfesConfig, rps: GinfesRps, pfxBuffer: Buffer): Promise<GinfesResult> {
  const agent = createMtlsAgent(pfxBuffer, config.certificadoSenha)
  const { certPem, keyPem } = extractCertFromPfx(pfxBuffer, config.certificadoSenha)
  const xml = buildEnviarLoteRpsXml(config, rps, certPem, keyPem)

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
  const { certPem, keyPem } = extractCertFromPfx(pfxBuffer, config.certificadoSenha)
  const xml = buildConsultarSituacaoLoteXml(config.cnpjPrestador, config.inscricaoMunicipal, protocolo, soapNamespace(config.wsdlUrl), certPem, keyPem)

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
  const { certPem, keyPem } = extractCertFromPfx(pfxBuffer, config.certificadoSenha)
  const xml = buildConsultarLoteRpsXml(config.cnpjPrestador, config.inscricaoMunicipal, protocolo, soapNamespace(config.wsdlUrl), certPem, keyPem)

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

export async function consultarNfsePorRps(
  config: GinfesConfig,
  rps: { numero: number; serie: string; tipo: number },
  pfxBuffer: Buffer,
): Promise<GinfesResult> {
  const agent = createMtlsAgent(pfxBuffer, config.certificadoSenha)
  const { certPem, keyPem } = extractCertFromPfx(pfxBuffer, config.certificadoSenha)
  const xml = buildConsultarNfsePorRpsXml(
    rps.numero,
    rps.serie,
    rps.tipo,
    config.cnpjPrestador,
    config.inscricaoMunicipal,
    soapNamespace(config.wsdlUrl),
    certPem,
    keyPem,
  )
  try {
    const response = await sendSoap(config.wsdlUrl, xml, agent)
    const mensagens = parseMensagensRetorno(response)
    if (mensagens.length > 0) {
      return { ok: false, mensagens, rawResponse: response, error: mensagens.map(m => `${m.codigo}: ${m.mensagem}`).join('; ') }
    }
    return {
      ok: true,
      numeroNf: extractTag(response, 'Numero') || undefined,
      codigoVerificacao: extractTag(response, 'CodigoVerificacao') || undefined,
      rawResponse: response,
    }
  } finally {
    agent.destroy()
  }
}

export async function cancelarNfseGinfes(
  config: GinfesConfig,
  numeroNfse: string,
  codigoCancelamento: string,
  pfxBuffer: Buffer,
): Promise<GinfesResult & { dataHora?: string }> {
  const agent = createMtlsAgent(pfxBuffer, config.certificadoSenha)
  const { certPem, keyPem } = extractCertFromPfx(pfxBuffer, config.certificadoSenha)
  const xml = buildCancelarNfseXml(
    numeroNfse,
    codigoCancelamento,
    config.cnpjPrestador,
    config.inscricaoMunicipal,
    config.codigoMunicipio,
    soapNamespace(config.wsdlUrl),
    certPem,
    keyPem,
  )

  try {
    const response = await sendSoap(config.wsdlUrl, xml, agent)
    const mensagens = parseMensagensRetorno(response)
    if (mensagens.length > 0) {
      return {
        ok: false,
        mensagens,
        rawResponse: response,
        error: mensagens.map(m => `${m.codigo}: ${m.mensagem}`).join('; '),
      }
    }

    const sucesso = extractTag(response, 'Sucesso').toLowerCase()
    if (!['true', '1'].includes(sucesso)) {
      return { ok: false, error: 'A prefeitura não confirmou o cancelamento da NFS-e.', rawResponse: response }
    }

    return {
      ok: true,
      numeroNf: numeroNfse,
      dataHora: extractTag(response, 'DataHora') || undefined,
      rawResponse: response,
      message: `NFS-e ${numeroNfse} cancelada e confirmada pela prefeitura.`,
    }
  } finally {
    agent.destroy()
  }
}

function resolveGinfesRuntimeConfig(rawConfig: Record<string, unknown>): { config?: GinfesConfig; pfxBuffer?: Buffer; error?: string } {
  const payload = (rawConfig.payload_reforma_tributaria ?? {}) as Record<string, unknown>
  const ambiente = String(rawConfig.ambiente ?? 'homologacao').trim()
  if (ambiente === 'producao' && process.env.NFSE_PRODUCAO_HABILITADA !== 'true') {
    return { error: 'Operação fiscal em produção bloqueada. Habilite NFSE_PRODUCAO_HABILITADA=true.' }
  }
  const wsdlUrl = String(
    ambiente === 'producao'
      ? payload.ginfes_wsdl_producao
      : payload.ginfes_wsdl_homologacao ?? payload.gissonline_wsdl_url,
  ).trim()
  if (!wsdlUrl) return { error: 'WSDL do GINFES não configurado.' }

  const pfxPath = String(rawConfig.certificado_pfx_path ?? '').trim()
  const certificadoSenha = String(rawConfig.certificado_senha ?? '').trim()
  if (!pfxPath) return { error: 'Caminho do certificado A1 não configurado.' }
  if (!certificadoSenha) return { error: 'Senha do certificado A1 não configurada.' }
  const absPfxPath = pfxPath.startsWith('/') ? pfxPath : join('/opt/avmd/AVMD_System/storage', pfxPath)
  if (!existsSync(absPfxPath)) return { error: `Certificado A1 não encontrado em ${absPfxPath}.` }

  return {
    pfxBuffer: readFileSync(absPfxPath),
    config: {
      wsdlUrl,
      cnpjPrestador: String(rawConfig.cnpj_emitente ?? '').replace(/\D/g, ''),
      inscricaoMunicipal: String(rawConfig.inscricao_municipal ?? '').replace(/\D/g, ''),
      codigoMunicipio: String(rawConfig.municipio_codigo_ibge ?? ''),
      naturezaOperacao: String(rawConfig.natureza_operacao ?? '1'),
      regimeEspecial: String(rawConfig.regime_especial ?? ''),
      simplesNacional: Boolean(rawConfig.simples_nacional),
      incentivoFiscal: Boolean(rawConfig.incentivo_fiscal),
      tipoRps: String(rawConfig.tipo_rps ?? '1'),
      serieRps: String(rawConfig.serie_rps ?? '1'),
      numeroRpsAtual: Number(rawConfig.numero_rps_atual ?? 1),
      codigoServicoMunicipio: String(rawConfig.codigo_servico_municipio ?? ''),
      codigoTributacaoMunicipio: String(rawConfig.codigo_tributacao_municipio ?? ''),
      cnae: String(rawConfig.cnae ?? ''),
      aliquotaIss: Number(rawConfig.aliquota_iss ?? 0),
      certificadoPfxPath: absPfxPath,
      certificadoSenha,
    },
  }
}

export async function cancelarNFSeEmitida(
  repo: CatalogRepository,
  input: {
    nfseId: string
    codigoCancelamento: string
    justificativa: string
    observacao?: string | null
    canceladoPor?: string | null
  },
): Promise<GinfesResult & { nfse?: unknown }> {
  const nota = await repo.getNfseById(input.nfseId) as Record<string, unknown> | null
  if (!nota) return { ok: false, error: 'NFS-e não encontrada.' }
  if (!['emitida', 'processado'].includes(String(nota.status_nf ?? '').toLowerCase())) {
    return { ok: false, error: 'Somente uma NFS-e emitida e ativa pode ser cancelada.' }
  }
  const numeroNfse = String(nota.numero_nf ?? '').trim()
  if (!numeroNfse || numeroNfse.startsWith('MOCK-')) {
    return { ok: false, error: 'A nota não possui número fiscal válido para cancelamento na prefeitura.' }
  }
  if (!/^000[1-5]$/.test(input.codigoCancelamento)) {
    return { ok: false, error: 'Código de cancelamento fiscal inválido.' }
  }
  if (!input.justificativa.trim()) {
    return { ok: false, error: 'A justificativa do cancelamento é obrigatória.' }
  }

  const rawConfig = await repo.getActiveNfseConfiguracao() as Record<string, unknown> | null
  if (!rawConfig) return { ok: false, error: 'Nenhuma configuração fiscal ativa encontrada.' }
  const runtime = resolveGinfesRuntimeConfig(rawConfig)
  if (!runtime.config || !runtime.pfxBuffer) return { ok: false, error: runtime.error ?? 'Configuração GINFES incompleta.' }

  const result = await cancelarNfseGinfes(runtime.config, numeroNfse, input.codigoCancelamento, runtime.pfxBuffer)
  if (!result.ok || !result.rawResponse) return result

  const updated = await repo.markNfseCancelled(input.nfseId, {
    codigo: input.codigoCancelamento,
    justificativa: input.justificativa.trim(),
    observacao: input.observacao?.trim() || null,
    canceladoPor: input.canceladoPor?.trim() || null,
    dataHora: result.dataHora ?? null,
    rawResponse: result.rawResponse,
  })
  if (!updated) {
    return { ok: false, error: 'A prefeitura confirmou, mas o CRM não conseguiu atualizar o status da nota.', rawResponse: result.rawResponse }
  }
  return { ...result, nfse: updated }
}

export async function emitirNFSeGinfes(
  repo: CatalogRepository,
  vendaId: string,
): Promise<GinfesResult> {
  const nfseExistentes = await repo.listNfseByVenda(vendaId) as Array<Record<string, unknown>>
  const nfseFiscalExistente = nfseExistentes.find(item => {
    const status = String(item.status_nf ?? '').toLowerCase()
    const numero = String(item.numero_nf ?? '')
    const payload = (item.payload_envio ?? {}) as Record<string, unknown>
    const protocolo = String(payload.protocolo ?? '')
    return !['erro', 'cancelada', 'cancelado'].includes(status)
      && (Boolean(protocolo) || (Boolean(numero) && !numero.startsWith('MOCK-')))
  })
  if (nfseFiscalExistente) {
    return {
      ok: false,
      error: `A venda já possui uma NFS-e fiscal vinculada (${String(nfseFiscalExistente.numero_nf ?? nfseFiscalExistente.id)}).`,
    }
  }

  const rawConfig = await repo.getActiveNfseConfiguracao()
  if (!rawConfig) return { ok: false, error: 'Nenhuma configuracao fiscal ativa encontrada.' }
  const config = rawConfig as Record<string, unknown>

  const payload = (config.payload_reforma_tributaria ?? {}) as Record<string, unknown>
  const ambiente = String(config.ambiente ?? 'homologacao').trim()
  if (ambiente === 'producao' && process.env.NFSE_PRODUCAO_HABILITADA !== 'true') {
    return { ok: false, error: 'Emissao fiscal em producao bloqueada. Conclua a homologacao e habilite NFSE_PRODUCAO_HABILITADA=true.' }
  }
  const wsdlUrl = String(
    ambiente === 'producao'
      ? payload.ginfes_wsdl_producao
      : payload.ginfes_wsdl_homologacao ?? payload.gissonline_wsdl_url,
  ).trim()
  if (!wsdlUrl) return { ok: false, error: 'WSDL do GINFES nao configurado.' }

  const pfxPath = String(config.certificado_pfx_path ?? '').trim()
  const certSenha = String(config.certificado_senha ?? '').trim()
  if (!pfxPath) return { ok: false, error: 'Caminho do certificado A1 nao configurado.' }
  if (!certSenha) return { ok: false, error: 'Senha do certificado A1 nao configurada.' }

  const absPfxPath = pfxPath.startsWith('/') ? pfxPath : join('/opt/avmd/AVMD_System/storage', pfxPath)
  if (!existsSync(absPfxPath)) return { ok: false, error: `Certificado A1 nao encontrado em ${absPfxPath}.` }
  const pfxBuffer = readFileSync(absPfxPath)

  const rawVenda = await repo.getNfseVendaContext(vendaId)
  if (!rawVenda) return { ok: false, error: 'Venda nao encontrada.' }
  const venda = rawVenda as Record<string, unknown>

  const numeroRps = Number(config.numero_rps_atual ?? 1)
  const agora = new Date()
  const dataEmissao = formatDateForSaoPaulo(agora)

  const doc = String(venda.documento_faturamento ?? '').replace(/\D/g, '')
  const isCnpj = doc.length === 14
  const naturezaMap: Record<string, string> = {
    'tributação no município': '1',
    'tributacao no municipio': '1',
    'tributação fora do município': '2',
    'tributacao fora do municipio': '2',
    'isenção': '3',
    'isencao': '3',
    'imune': '4',
    'exigibilidade suspensa por decisão judicial': '5',
    'exigibilidade suspensa por procedimento administrativo': '6',
  }
  const naturezaRaw = String(config.natureza_operacao ?? '1').trim()
  const naturezaOperacao = naturezaMap[naturezaRaw.toLocaleLowerCase('pt-BR')] ?? naturezaRaw

  const rps: GinfesRps = {
    numero: numeroRps,
    serie: String(config.serie_rps ?? '1'),
    tipo: Number(config.tipo_rps ?? 1),
    dataEmissao,
    naturezaOperacao,
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
      valorIss: config.simples_nacional && !venda.iss_retido
        ? 0
        : Number(venda.valor_venda ?? 0) * Number(config.aliquota_iss ?? 0) / 100,
      valorIssRetido: 0,
      outrasRetencoes: 0,
      baseCalculo: Number(venda.valor_venda ?? 0),
      aliquota: Number(config.aliquota_iss ?? 0),
      valorLiquidoNfse: Number(venda.valor_venda ?? 0),
      descontoIncondicionado: 0,
      descontoCondicionado: 0,
      itemListaServico: String(config.codigo_servico_municipio ?? ''),
      codigoCnae: String(config.cnae ?? '').replace(/\D/g, ''),
      codigoTributacaoMunicipio: String(config.codigo_tributacao_municipio ?? ''),
      discriminacao: String(venda.observacoes ?? `Servico de certificado digital - venda ${vendaId.slice(0, 8)}`),
      codigoMunicipio: String(config.municipio_codigo_ibge ?? ''),
    },
    prestador: {
      cnpj: String(config.cnpj_emitente ?? ''),
      inscricaoMunicipal: String(config.inscricao_municipal ?? ''),
    },
    tomador: {
      cpfCnpj: isCnpj ? { cnpj: doc } : { cpf: doc },
      inscricaoMunicipal: String(venda.inscricao_municipal ?? ''),
      razaoSocial: String(venda.nome_faturamento ?? ''),
      endereco: {
        endereco: String(venda.logradouro ?? ''),
        numero: String(venda.numero ?? 's/n'),
        complemento: String(venda.complemento ?? ''),
        bairro: String(venda.bairro ?? ''),
        codigoMunicipio: String(venda.ibge ?? config.municipio_codigo_ibge ?? ''),
        uf: String(venda.uf ?? ''),
        cep: String(venda.cep ?? '').replace(/\D/g, ''),
      },
      contato: {
        telefone: String(venda.telefone_faturamento ?? '').replace(/\D/g, ''),
        email: String(venda.email_faturamento ?? ''),
      },
    },
  }

  const ginfesConfig: GinfesConfig = {
    wsdlUrl,
    cnpjPrestador: String(config.cnpj_emitente ?? '').replace(/\D/g, ''),
    inscricaoMunicipal: String(config.inscricao_municipal ?? '').replace(/\D/g, ''),
    codigoMunicipio: String(config.municipio_codigo_ibge ?? ''),
    naturezaOperacao,
    regimeEspecial: String(config.regime_especial ?? ''),
    simplesNacional: Boolean(config.simples_nacional),
    incentivoFiscal: Boolean(config.incentivo_fiscal),
    tipoRps: String(config.tipo_rps ?? '1'),
    serieRps: String(config.serie_rps ?? '1'),
    numeroRpsAtual: Number(config.numero_rps_atual ?? 1),
    codigoServicoMunicipio: String(config.codigo_servico_municipio ?? ''),
    codigoTributacaoMunicipio: String(config.codigo_tributacao_municipio ?? ''),
    cnae: String(config.cnae ?? ''),
    aliquotaIss: Number(config.aliquota_iss ?? 0),
    certificadoPfxPath: absPfxPath,
    certificadoSenha: certSenha,
  }

  const result = await enviarLoteRps(ginfesConfig, rps, pfxBuffer)

  if (result.ok && result.protocolo) {
    await repo.createNfse({
      venda_certificado_id: vendaId,
      cadastro_base_tomador_id: String(venda.cadastro_base_id ?? '') || null,
      numero_nf: null,
      codigo_verificacao: null,
      status_nf: 'enviado',
      data_emissao: agora.toISOString(),
      valor_servico: Number(venda.valor_venda ?? 0),
      valor_iss: rps.servico.valorIss,
      payload_envio: { modo: 'ginfes', rps, protocolo: result.protocolo, numero_lote: result.numeroLote },
      payload_retorno: {},
      metadata: { ginfes_wsdl: wsdlUrl, numero_rps: numeroRps },
    })

    await repo.updateNfseConfigRpsNumber(String(config.id), numeroRps + 1)

    const pollingResult = await pollLoteRps(ginfesConfig, result.protocolo, pfxBuffer)
    if (pollingResult.ok && pollingResult.numeroNf) {
      await repo.updateNfseStatusByProtocolo(result.protocolo, {
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
