import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

export interface LinkManifest {
  projectId: string
  projectSlug: string
  remotePrefix: string
  ignoreGlobs: string[]
}

function assertLinkManifest(value: unknown): asserts value is LinkManifest {
  if (!value || typeof value !== 'object') {
    throw new Error('Expected an object')
  }

  const candidate = value as Record<string, unknown>
  const hasValidIgnoreGlobs =
    Array.isArray(candidate.ignoreGlobs) &&
    candidate.ignoreGlobs.every((entry) => typeof entry === 'string')

  if (
    typeof candidate.projectId !== 'string' ||
    typeof candidate.projectSlug !== 'string' ||
    typeof candidate.remotePrefix !== 'string' ||
    !hasValidIgnoreGlobs
  ) {
    throw new Error('Missing required manifest fields')
  }
}

export function getLinkManifestDir(root: string): string {
  return join(resolve(root), '.specdown')
}

export function getLinkManifestPath(root: string): string {
  return join(getLinkManifestDir(root), 'project.json')
}

function ensureLinkManifestDir(root: string): string {
  const dir = getLinkManifestDir(root)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true, mode: 0o700 })
  }
  return dir
}

export function readLinkManifest(root: string): LinkManifest {
  let raw: string

  try {
    raw = readFileSync(getLinkManifestPath(root), 'utf-8')
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    throw new Error(`Failed to read SpecDown link manifest: ${message}`)
  }

  try {
    const parsed = JSON.parse(raw) as unknown
    assertLinkManifest(parsed)
    return parsed
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    throw new Error(`Invalid SpecDown link manifest: ${message}`)
  }
}

export function writeLinkManifest(root: string, manifest: LinkManifest): void {
  ensureLinkManifestDir(root)
  writeFileSync(getLinkManifestPath(root), `${JSON.stringify(manifest, null, 2)}\n`, {
    encoding: 'utf-8',
    mode: 0o600,
  })
}

export function removeLinkManifest(root: string): boolean {
  const path = getLinkManifestPath(root)
  if (!existsSync(path)) return false
  unlinkSync(path)
  return true
}

export function hasLinkManifest(root: string): boolean {
  return existsSync(getLinkManifestPath(root))
}
