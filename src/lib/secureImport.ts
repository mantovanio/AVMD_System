import * as XLSX from 'xlsx-js-style'

export interface ImportColumn {
  key: string
  label: string
  required?: boolean
  transform?: (value: string) => string
  validate?: (value: string) => string | null
}

export interface ImportResult<T> {
  data: T[]
  errors: ImportError[]
  warnings: string[]
}

export interface ImportError {
  row: number
  column?: string
  message: string
  value?: unknown
}

export interface SecureImportOptions<T> {
  allowedColumns: ImportColumn[]
  maxRows?: number
  maxFileSize?: number
  sheetName?: string
  skipEmptyRows?: boolean
}

const FORMULA_PREFIXES = ['=', '+', '-', '@']
const DANGEROUS_PATTERNS = [
  /^=\w+\(/,
  /HYPERLINK/i,
  /WEBSERVICE/i,
  /IMPORTXML/i,
  /IMPORTDATA/i,
  /IMPORTHTML/i,
  /IMPORTFEED/i,
  /CALL/i,
  /REGISTER/i,
  /EXEC/i,
  /SHELL/i,
  /SYSTEM/i,
]

function isFormula(value: string): boolean {
  const trimmed = value.trimStart()
  return FORMULA_PREFIXES.some(p => trimmed.startsWith(p))
}

function hasDangerousPattern(value: string): boolean {
  return DANGEROUS_PATTERNS.some(p => p.test(value))
}

function sanitizeCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  const str = String(value).trim()
  if (isFormula(str)) {
    return `'${str}`
  }
  return str
}

function validateCell(value: string, column: ImportColumn): string | null {
  if (column.required && !value) {
    return 'Campo obrigatório'
  }
  if (column.validate) {
    return column.validate(value)
  }
  return null
}

export async function secureImportSpreadsheet<T extends Record<string, unknown>>(
  file: File,
  options: SecureImportOptions<T>
): Promise<ImportResult<T>> {
  const {
    allowedColumns,
    maxRows = 5000,
    maxFileSize = 5 * 1024 * 1024,
    sheetName,
    skipEmptyRows = true,
  } = options

  const errors: ImportError[] = []
  const warnings: string[] = []
  const data: T[] = []

  const fileSize = file.size
  if (fileSize > maxFileSize) {
    errors.push({ row: 0, message: `Arquivo excede ${maxFileSize / 1024 / 1024}MB` })
    return { data, errors, warnings }
  }

  const allowedMimes = [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'text/csv',
    'application/csv',
  ]
  if (!allowedMimes.includes(file.type)) {
    errors.push({ row: 0, message: 'Tipo de arquivo não permitido. Use .xlsx, .xls ou .csv' })
    return { data, errors, warnings }
  }

  const arrayBuffer = await file.arrayBuffer()

  let workbook: XLSX.WorkBook
  try {
    workbook = XLSX.read(arrayBuffer, {
      type: 'array',
      cellFormula: false,
      cellHTML: false,
      cellNF: false,
      cellStyles: false,
      cellText: true,
      cellDates: true,
      sheetRows: maxRows + 1,
    })
  } catch (e) {
    errors.push({ row: 0, message: `Falha ao ler planilha: ${e instanceof Error ? e.message : 'formato inválido'}` })
    return { data, errors, warnings }
  }

  const sheet = sheetName
    ? workbook.Sheets[sheetName]
    : workbook.Sheets[workbook.SheetNames[0]]

  if (!sheet) {
    errors.push({ row: 0, message: 'Planilha não encontrada' })
    return { data, errors, warnings }
  }

  const rawRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: false,
    dateNF: 'yyyy-mm-dd',
    defval: '',
    blankrows: !skipEmptyRows,
  })

  const rows = rawRows as (string | number | boolean | null)[][]

  if (rows.length === 0) {
    warnings.push('Planilha vazia')
    return { data, errors, warnings }
  }

  const headerRow = rows[0] as string[]
  const columnMap = new Map<number, ImportColumn>()

  headerRow.forEach((header, idx) => {
    const col = allowedColumns.find(c => c.label.toLowerCase() === header.toLowerCase() || c.key.toLowerCase() === header.toLowerCase())
    if (col) columnMap.set(idx, col)
    else warnings.push(`Coluna ignorada: "${header}" (não permitida)`)
  })

  const requiredColumns = allowedColumns.filter(c => c.required)
  const foundRequired = requiredColumns.filter(c =>
    [...columnMap.values()].some(v => v.key === c.key)
  )
  if (foundRequired.length !== requiredColumns.length) {
    const missing = requiredColumns.filter(c => !foundRequired.includes(c))
    errors.push({ row: 0, message: `Colunas obrigatórias ausentes: ${missing.map(c => c.label).join(', ')}` })
    return { data, errors, warnings }
  }

  for (let i = 1; i < rows.length; i++) {
    if (data.length >= maxRows) {
      warnings.push(`Limite de ${maxRows} linhas atingido. Linhas restantes ignoradas.`)
      break
    }

    const row = rows[i]
    const isEmpty = row.every(v => v === null || v === undefined || String(v).trim() === '')
    if (isEmpty && skipEmptyRows) continue

    const record: Record<string, unknown> = {}
    let rowHasError = false

    for (const [idx, col] of columnMap.entries()) {
      const rawValue = row[idx]
      const sanitized = sanitizeCell(rawValue)

      if (hasDangerousPattern(sanitized)) {
        warnings.push(`Linha ${i + 1}, coluna "${col.label}": padrão suspeito detectado e neutralizado`)
      }

      const validationError = validateCell(sanitized, col)
      if (validationError) {
        errors.push({ row: i + 1, column: col.label, message: validationError, value: rawValue })
        rowHasError = true
        continue
      }

      let finalValue: unknown = sanitized
      if (col.transform) {
        try {
          finalValue = col.transform(sanitized)
        } catch {
          errors.push({ row: i + 1, column: col.label, message: 'Erro na transformação', value: rawValue })
          rowHasError = true
        }
      }

      record[col.key] = finalValue
    }

    if (!rowHasError) {
      data.push(record as T)
    }
  }

  return { data, errors, warnings }
}

export function generateImportTemplate(allowedColumns: ImportColumn[]): string {
  const headers = allowedColumns.map(c => c.label).join(',')
  const example = allowedColumns.map(c => c.required ? 'obrigatório' : 'opcional').join(',')
  return `${headers}\n${example}`
}

export function exportToCSV<T extends Record<string, unknown>>(
  data: T[],
  columns: ImportColumn[],
  filename: string
): void {
  const headers = columns.map(c => c.label).join(',')
  const rows = data.map(record =>
    columns.map(col => {
      const value = record[col.key] ?? ''
      const str = String(value)
      if (/^[\=\+\-\@]/.test(str.trim()) || str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`
      }
      return str
    }).join(',')
  )
  const csv = [headers, ...rows].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}