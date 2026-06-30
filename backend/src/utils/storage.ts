import * as fs from 'node:fs'
import * as path from 'node:path'
import * as crypto from 'node:crypto'

const DEFAULT_STORAGE_ROOT = process.env.FILE_STORAGE_ROOT || path.resolve(process.cwd(), 'storage', 'attachments')

export function getStorageRoot(): string {
  return DEFAULT_STORAGE_ROOT
}

export function ensureStorageDir(subdir?: string): string {
  const dir = subdir ? path.join(DEFAULT_STORAGE_ROOT, subdir) : DEFAULT_STORAGE_ROOT
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

export function buildStoredPath(conversationId: string, originalName: string): string {
  const safeName = originalName.replace(/[<>:"/\\|?*]/g, '_')
  const unique = `${crypto.randomUUID()}_${safeName}`
  const relative = path.join(conversationId, unique)
  const full = path.join(DEFAULT_STORAGE_ROOT, relative)
  ensureStorageDir(conversationId)
  return full
}

export function getRelativePath(fullPath: string): string {
  return path.relative(DEFAULT_STORAGE_ROOT, fullPath)
}

export function saveFile(storedPath: string, buffer: Buffer): void {
  fs.writeFileSync(storedPath, buffer)
}

export function readFile(storedPath: string): Buffer | null {
  try {
    return fs.readFileSync(storedPath)
  } catch {
    return null
  }
}

export function deleteFile(storedPath: string): boolean {
  try {
    fs.unlinkSync(storedPath)
    return true
  } catch {
    return false
  }
}
