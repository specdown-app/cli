import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'

import type { SyncFileSnapshot } from './sync-plan.js'

const IGNORED_DIRECTORIES = new Set(['.git', '.specdown', 'node_modules'])
const DOC_EXTENSIONS = new Set(['.md', '.markdown', '.mdx'])

function normalizeRemotePrefix(prefix: string | undefined): string {
  const value = (prefix ?? '/').trim()
  if (!value || value === '/') return '/'
  return `/${value.replace(/^\/+/, '').replace(/\/+$/, '')}`
}

function hashContent(content: string): string {
  return createHash('sha256').update(content, 'utf-8').digest('hex')
}

function normalizeRelativePath(path: string): string {
  return path.split(sep).join('/').replace(/^\/+/, '')
}

export function isSupportedIgnoreGlob(pattern: string): boolean {
  const normalizedPattern = pattern.replace(/^\/+/, '').trim()
  if (!normalizedPattern) return true

  if (normalizedPattern.endsWith('/**')) {
    return !normalizedPattern.slice(0, -3).includes('*')
  }

  return !normalizedPattern.includes('*')
}

export function shouldIgnoreRelativePath(relativePath: string, ignoreGlobs: string[] = []): boolean {
  const normalizedPath = normalizeRelativePath(relativePath)
  if (!normalizedPath) return false

  return ignoreGlobs.some((pattern) => {
    const normalizedPattern = pattern.replace(/^\/+/, '').trim()
    if (!normalizedPattern) return false

    if (normalizedPattern.endsWith('/**')) {
      const prefix = normalizedPattern.slice(0, -3).replace(/\/+$/, '')
      return normalizedPath === prefix || normalizedPath.startsWith(`${prefix}/`)
    }

    return normalizedPath === normalizedPattern
  })
}

function toLinkedPath(root: string, filePath: string, remotePrefix: string): string {
  const relativePath = filePath
    .replace(resolve(root), '')
    .split(sep)
    .join('/')
    .replace(/^\/+/, '')

  if (!relativePath) return normalizeRemotePrefix(remotePrefix)
  return `${normalizeRemotePrefix(remotePrefix).replace(/\/$/, '')}/${relativePath}`
}

function scanDirectory(
  root: string,
  currentDir: string,
  remotePrefix: string,
  ignoreGlobs: string[],
  files: SyncFileSnapshot[]
): void {
  for (const entry of readdirSync(currentDir, { withFileTypes: true })) {
    const entryPath = join(currentDir, entry.name)
    const relativePath = normalizeRelativePath(entryPath.replace(resolve(root), ''))

    if (entry.isDirectory()) {
      if (IGNORED_DIRECTORIES.has(entry.name)) continue
      if (shouldIgnoreRelativePath(relativePath, ignoreGlobs)) continue
      scanDirectory(root, entryPath, remotePrefix, ignoreGlobs, files)
      continue
    }

    if (!entry.isFile()) continue
    if (shouldIgnoreRelativePath(relativePath, ignoreGlobs)) continue

    const dotIndex = entry.name.lastIndexOf('.')
    if (dotIndex < 0) continue

    const ext = entry.name.slice(dotIndex).toLowerCase()
    if (!DOC_EXTENSIONS.has(ext)) continue

    const content = readFileSync(entryPath, 'utf-8')
    files.push({
      path: toLinkedPath(root, entryPath, remotePrefix),
      hash: hashContent(content),
    })
  }
}

export function scanLocalTree(root: string, remotePrefix = '/', ignoreGlobs: string[] = []): SyncFileSnapshot[] {
  const files: SyncFileSnapshot[] = []
  const resolvedRoot = resolve(root)

  if (!existsSync(resolvedRoot) || !statSync(resolvedRoot).isDirectory()) return files
  const unsupportedPattern = ignoreGlobs.find((pattern) => !isSupportedIgnoreGlob(pattern))
  if (unsupportedPattern) {
    throw new Error(
      `Unsupported SpecDown ignore glob "${unsupportedPattern}". Only exact paths and "/**" prefixes are supported.`
    )
  }

  scanDirectory(resolvedRoot, resolvedRoot, remotePrefix, ignoreGlobs, files)
  return files.sort((a, b) => a.path.localeCompare(b.path))
}
