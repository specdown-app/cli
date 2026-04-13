import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import type { SyncFileSnapshot } from './sync-plan.js'

export interface SyncState {
  files: SyncFileSnapshot[]
  updatedAt?: string
}

function getSyncStateDir(root: string): string {
  return join(resolve(root), '.specdown')
}

export function getSyncStatePath(root: string): string {
  return join(getSyncStateDir(root), 'sync-state.json')
}

function ensureSyncStateDir(root: string): void {
  const dir = getSyncStateDir(root)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true, mode: 0o700 })
  }
}

function normalizeStateFile(value: unknown): SyncFileSnapshot | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Record<string, unknown>
  if (typeof candidate.path !== 'string' || typeof candidate.hash !== 'string') return null

  return {
    path: candidate.path,
    hash: candidate.hash,
    documentId: typeof candidate.documentId === 'string' ? candidate.documentId : undefined,
  }
}

function parseSyncState(path: string, parsed: unknown): SyncState {
  if (Array.isArray(parsed)) {
    return {
      files: parsed.map(normalizeStateFile).filter((entry): entry is SyncFileSnapshot => Boolean(entry)),
    }
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error(`Invalid SpecDown sync state at ${path}: expected an object or file array.`)
  }

  const candidate = parsed as Record<string, unknown>
  if ('files' in candidate && candidate.files !== undefined && !Array.isArray(candidate.files)) {
    throw new Error(`Invalid SpecDown sync state at ${path}: "files" must be an array.`)
  }

  const files = Array.isArray(candidate.files)
    ? candidate.files.map(normalizeStateFile).filter((entry): entry is SyncFileSnapshot => Boolean(entry))
    : []

  if (Array.isArray(candidate.files) && files.length !== candidate.files.length) {
    throw new Error(`Invalid SpecDown sync state at ${path}: each file must include string "path" and "hash".`)
  }

  if ('updatedAt' in candidate && candidate.updatedAt !== undefined && typeof candidate.updatedAt !== 'string') {
    throw new Error(`Invalid SpecDown sync state at ${path}: "updatedAt" must be a string.`)
  }

  return {
    files,
    updatedAt: typeof candidate.updatedAt === 'string' ? candidate.updatedAt : undefined,
  }
}

export function readSyncState(root: string): SyncState {
  const path = getSyncStatePath(root)
  if (!existsSync(path)) return { files: [] }

  try {
    return parseSyncState(path, JSON.parse(readFileSync(path, 'utf-8')) as unknown)
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Invalid SpecDown sync state')) {
      throw error
    }

    throw new Error(`Invalid SpecDown sync state at ${path}: failed to parse JSON.`)
  }
}

export function writeSyncState(root: string, state: SyncState): void {
  ensureSyncStateDir(root)
  writeFileSync(getSyncStatePath(root), `${JSON.stringify(state, null, 2)}\n`, {
    encoding: 'utf-8',
    mode: 0o600,
  })
}
