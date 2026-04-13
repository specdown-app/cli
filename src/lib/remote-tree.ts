import { createHash } from 'node:crypto'

import type { Config } from './config.js'
import { getClient } from './api.js'
import { normalizePath } from './path.js'
import type { SyncFileSnapshot } from './sync-plan.js'

interface RemoteTreeRow {
  id: string
  full_path: string
  content: string | null
}

function hashContent(content: string): string {
  return createHash('sha256').update(content, 'utf-8').digest('hex')
}

export function filterRemoteFilesByPrefix(
  files: SyncFileSnapshot[],
  remotePrefix = '/'
): SyncFileSnapshot[] {
  const normalizedPrefix = normalizePath(remotePrefix)
  if (normalizedPrefix === '/') {
    return files
  }

  return files.filter((file) => {
    const normalizedPath = normalizePath(file.path)
    return (
      normalizedPath === normalizedPrefix ||
      normalizedPath.startsWith(`${normalizedPrefix}/`)
    )
  })
}

export async function readRemoteTree(
  cfg: Config,
  projectId: string,
  remotePrefix = '/'
): Promise<SyncFileSnapshot[]> {
  const supabase = await getClient(cfg)
  const normalizedPrefix = normalizePath(remotePrefix)
  let query = supabase
    .from('documents')
    .select('id, full_path, content, is_folder, deleted_at')
    .eq('project_id', projectId)
    .is('deleted_at', null)
    .eq('is_folder', false)

  if (normalizedPrefix !== '/') {
    query = query.like('full_path', `${normalizedPrefix}/%`)
  }

  const { data, error } = await query

  if (error) throw error

  const files = ((data ?? []) as RemoteTreeRow[])
    .map((doc) => ({
      path: normalizePath(doc.full_path),
      hash: hashContent(doc.content ?? ''),
      documentId: doc.id,
    }))
    .sort((a, b) => a.path.localeCompare(b.path))

  return filterRemoteFilesByPrefix(files, normalizedPrefix)
}
