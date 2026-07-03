const HTML_ENTITY_MAP: Record<string, string> = {
  aacute: 'á', Aacute: 'Á', agrave: 'à', Agrave: 'À', acirc: 'â', Acirc: 'Â', atilde: 'ã', Atilde: 'Ã',
  eacute: 'é', Eacute: 'É', egrave: 'è', Egrave: 'È', ecirc: 'ê', Ecirc: 'Ê',
  iacute: 'í', Iacute: 'Í', igrave: 'ì', Igrave: 'Ì', icirc: 'î', Icirc: 'Î',
  oacute: 'ó', Oacute: 'Ó', ograve: 'ò', Ograve: 'Ò', ocirc: 'ô', Ocirc: 'Ô', otilde: 'õ', Otilde: 'Õ',
  uacute: 'ú', Uacute: 'Ú', ugrave: 'ù', Ugrave: 'Ù', ucirc: 'û', Ucirc: 'Û', uuml: 'ü', Uuml: 'Ü',
  ccedil: 'ç', Ccedil: 'Ç',
  nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
}

function decodeHtmlEntities(text: string): string {
  return text.replace(/&(#(\d+)|#x([0-9a-fA-F]+)|([a-zA-Z]+));/g, (match, _group, dec, hex, named) => {
    if (dec) return String.fromCharCode(Number(dec))
    if (hex) return String.fromCharCode(parseInt(hex, 16))
    return HTML_ENTITY_MAP[named as string] ?? match
  })
}

const CAMPOS_COM_ROTULO = [
  'CPF/CNPJ',
  'Telefone Celular',
  'Telefone',
  'Email',
  'Cliente',
  'Pedido',
  'Código',
  'Produto',
  'Posto',
  'Data',
  'Hora',
]

const ROTULOS_CHAVE = ['Cliente:', 'CPF/CNPJ:', 'Telefone:', 'Email:', 'Pedido:', 'Produto:']

function pareceMensagemEstruturada(text: string): boolean {
  return ROTULOS_CHAVE.filter(rotulo => text.includes(rotulo)).length >= 3
}

function reconstruirQuebrasDeLinha(text: string): string {
  let result = text.replace(/([^\n])\s*(Detalhes do Agendamento)/g, '$1\n$2')
  for (const campo of CAMPOS_COM_ROTULO) {
    const marcador = `${campo}:`
    const escaped = marcador.replace(/[/]/g, '\\/')
    const pattern = new RegExp(`([^\\n])\\s*${escaped}`, 'g')
    result = result.replace(pattern, `$1\n${marcador}`)
  }
  return result
}

export function normalizeStructuredMessage(raw: string | null | undefined): string {
  const text = String(raw ?? '')
  if (!text) return text
  const decoded = decodeHtmlEntities(text)
  if (!pareceMensagemEstruturada(decoded)) return decoded
  const reconstructed = reconstruirQuebrasDeLinha(decoded)
  return reconstructed.split('\n').map(line => line.trim()).join('\n')
}
