export type LogLevel = 'info' | 'warn' | 'error'

export interface LogEntry {
  id:      number
  ts:      Date
  level:   LogLevel
  module:  string
  message: string
  data?:   unknown
}

const MAX     = 300
const buffer: LogEntry[] = []
let   seq     = 0

const STYLE: Record<LogLevel, string> = {
  info:  'color:#22c55e;font-weight:bold',
  warn:  'color:#f59e0b;font-weight:bold',
  error: 'color:#ef4444;font-weight:bold',
}

const SENSITIVE_KEY_PATTERN = /(telefone|phone|celular|whatsapp|email|mail|cpf|cnpj|documento|token|secret|senha|password|authorization|api[_-]?key|x-api-key)/i

function maskSensitiveValue(value: unknown) {
  const text = String(value ?? '')
  if (!text) return text
  if (text.includes('@')) {
    const [name, domain] = text.split('@')
    return `${name.slice(0, 2)}***@${domain}`
  }
  const digits = text.replace(/\D/g, '')
  if (digits.length >= 8) return `${digits.slice(0, 3)}***${digits.slice(-2)}`
  if (text.length > 6) return `${text.slice(0, 2)}***${text.slice(-2)}`
  return '***'
}

function sanitizeLogData(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(item => sanitizeLogData(item))
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).map(([key, current]) => [
      key,
      SENSITIVE_KEY_PATTERN.test(key) ? maskSensitiveValue(current) : sanitizeLogData(current),
    ])
    return Object.fromEntries(entries)
  }
  return value
}

function add(level: LogLevel, module: string, message: string, data?: unknown) {
  const safeData = data === undefined ? undefined : sanitizeLogData(data)
  const entry: LogEntry = { id: ++seq, ts: new Date(), level, module, message, data: safeData }
  buffer.push(entry)
  if (buffer.length > MAX) buffer.shift()
  ;(window as unknown as Record<string, unknown>).__certiidLogs = buffer

  if (safeData !== undefined) {
    console[level](`%c[${module}]%c ${message}`, STYLE[level], '', safeData)
  } else {
    console[level](`%c[${module}]%c ${message}`, STYLE[level], '')
  }
}

export const logger = {
  info:    (module: string, msg: string, data?: unknown) => add('info',  module, msg, data),
  warn:    (module: string, msg: string, data?: unknown) => add('warn',  module, msg, data),
  error:   (module: string, msg: string, data?: unknown) => add('error', module, msg, data),
  entries: (): LogEntry[] => [...buffer].reverse(),
  clear:   () => { buffer.length = 0 },
}
