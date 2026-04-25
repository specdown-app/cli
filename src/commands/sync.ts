import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import chalk from 'chalk'
import ora from 'ora'

import { getClient } from '../lib/api.js'
import { shouldProceedWithSync, formatConflictSummary, formatSyncPlanSummary, type SyncPromptArgs } from '../lib/confirmation.js'
import { requireAuth, type Config } from '../lib/config.js'
import { buildDocumentInsertFields } from '../lib/document-fields.js'
import { watchLinkedFolder } from '../lib/fs-watch.js'
import { readLinkManifest } from '../lib/link-config.js'
import { scanLocalTree } from '../lib/local-tree.js'
import { normalizePath } from '../lib/path.js'
import { readRemoteTree } from '../lib/remote-tree.js'
import { readSyncState, writeSyncState } from '../lib/sync-state.js'
import { buildSyncPlan, type SyncConflict, type SyncFileSnapshot } from '../lib/sync-plan.js'

interface SyncOptions extends SyncPromptArgs {
  dir?: string
  watch?: boolean
}

function createRemotePathToLocalFile(root: string, remotePrefix: string, fullPath: string): string {
  const normalizedPrefix = normalizePath(remotePrefix)
  const normalizedPath = normalizePath(fullPath)

  if (normalizedPrefix === '/') {
    return join(root, normalizedPath.replace(/^\/+/, ''))
  }

  const relativePath = normalizedPath.startsWith(`${normalizedPrefix}/`)
    ? normalizedPath.slice(normalizedPrefix.length + 1)
    : normalizedPath.replace(/^\/+/, '')

  return join(root, relativePath)
}

function buildRemoteInsertPayload(cfg: Config, projectId: string, fullPath: string, content: string) {
  const { title, slug, path } = buildDocumentInsertFields(fullPath)

  return {
    project_id: projectId,
    created_by: cfg.user_id,
    title,
    slug,
    path,
    is_folder: false,
    parent_id: null,
    sort_order: 9999,
    content,
  }
}

export function buildNextSyncState(input: {
  previousFiles: SyncFileSnapshot[]
  remoteFiles: SyncFileSnapshot[]
  conflicts: SyncConflict[]
}): SyncFileSnapshot[] {
  const conflictPaths = new Set(input.conflicts.map((item) => item.path))
  const preservedConflictFiles = input.previousFiles.filter((file) => conflictPaths.has(file.path))
  const updatedFiles = input.remoteFiles.filter((file) => !conflictPaths.has(file.path))

  return [...preservedConflictFiles, ...updatedFiles].sort((a, b) => a.path.localeCompare(b.path))
}

async function runSyncOnce(root: string, opts: SyncOptions): Promise<void> {
  const cfg = requireAuth()
  const manifest = readLinkManifest(root)
  const spinner = ora(`Preparing sync for ${manifest.projectSlug}…`).start()

  const [localFiles, state, remoteFiles] = await Promise.all([
    Promise.resolve(scanLocalTree(root, manifest.remotePrefix, manifest.ignoreGlobs)),
    Promise.resolve(readSyncState(root)),
    readRemoteTree(cfg, manifest.projectId, manifest.remotePrefix),
  ])

  const plan = buildSyncPlan({
    localFiles,
    remoteFiles,
    stateFiles: state.files,
  })

  spinner.stop()
  console.log(chalk.bold(`${manifest.projectSlug} ${chalk.gray(manifest.remotePrefix)}`))
  console.log(`local ${localFiles.length}, remote ${remoteFiles.length}, tracked ${state.files.length}`)
  console.log(formatSyncPlanSummary(plan))

  if (plan.conflicts.length && !opts.force) {
    console.error(
      chalk.red(
        `Conflicts detected: ${formatConflictSummary(plan)}. Re-run with --force to apply only non-conflicting sync changes.`
      )
    )
    return
  }

  const remoteUpserts = [...plan.push, ...plan.createRemote]
  const remoteDeletes = [...plan.deleteRemote]
  const localWrites = [...plan.pull, ...plan.createLocal]
  const localDeletes = [...plan.deleteLocal]
  const totalWork = remoteUpserts.length + remoteDeletes.length + localWrites.length + localDeletes.length

  if (!totalWork) {
    if (plan.conflicts.length) {
      console.log(chalk.yellow(`No non-conflicting changes applied. Pending conflicts: ${formatConflictSummary(plan)}`))
    } else {
      console.log(chalk.gray('No sync changes detected.'))
    }
    return
  }

  const shouldProceed = await shouldProceedWithSync(opts, {
    prompt: `Apply ${totalWork} synchronized change(s) for ${manifest.projectSlug}? [y/N] `,
  })

  if (!shouldProceed) {
    console.log(chalk.gray('Aborted.'))
    return
  }

  const applySpinner = ora('Applying linked-folder sync…').start()
  const supabase = await getClient(cfg)
  const remoteByPath = new Map(remoteFiles.map((file) => [file.path, file]))
  let updatedRemoteCount = 0
  let createdRemoteCount = 0
  let deletedRemoteCount = 0
  let wroteLocalCount = 0
  let deletedLocalCount = 0

  for (const file of remoteUpserts) {
    const localPath = createRemotePathToLocalFile(root, manifest.remotePrefix, file.path)
    const content = readFileSync(localPath, 'utf-8')
    const remoteSnapshot = remoteByPath.get(file.path)

    if (remoteSnapshot?.documentId) {
      const { error } = await supabase.rpc('save_document', {
        p_document_id: remoteSnapshot.documentId,
        p_content: content,
        p_commit_message: `specdown sync ${file.path}`,
      })

      if (error) throw error
      updatedRemoteCount += 1
      continue
    }

    const { error } = await supabase
      .from('documents')
      .insert(buildRemoteInsertPayload(cfg, manifest.projectId, file.path, content))

    if (error) throw error
    createdRemoteCount += 1
  }

  for (const file of remoteDeletes) {
    const documentId = remoteByPath.get(file.path)?.documentId ?? file.documentId
    if (!documentId) continue

    const { error } = await supabase
      .from('documents')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', documentId)

    if (error) throw error
    deletedRemoteCount += 1
  }

  if (localWrites.length) {
    const { data, error } = await supabase
      .from('documents')
      .select('full_path, content')
      .eq('project_id', manifest.projectId)
      .eq('is_folder', false)
      .is('deleted_at', null)
      .in('full_path', localWrites.map((file) => file.path))

    if (error) throw error

    const remoteContentByPath = new Map(
      (data ?? []).map((doc) => [normalizePath(doc.full_path), doc.content ?? ''])
    )

    for (const file of localWrites) {
      const content = remoteContentByPath.get(file.path)
      if (content === undefined) {
        throw new Error(`Remote document not found during sync: ${file.path}`)
      }

      const outFile = createRemotePathToLocalFile(root, manifest.remotePrefix, file.path)
      const dir = dirname(outFile)
      if (dir !== '.') mkdirSync(dir, { recursive: true })
      writeFileSync(outFile, content, 'utf-8')
      wroteLocalCount += 1
    }
  }

  for (const file of localDeletes) {
    const localPath = createRemotePathToLocalFile(root, manifest.remotePrefix, file.path)
    if (existsSync(localPath)) {
      unlinkSync(localPath)
      deletedLocalCount += 1
    }
  }

  const updatedRemoteFiles = await readRemoteTree(cfg, manifest.projectId, manifest.remotePrefix)
  writeSyncState(root, {
    files: buildNextSyncState({
      previousFiles: state.files,
      remoteFiles: updatedRemoteFiles,
      conflicts: plan.conflicts,
    }),
    updatedAt: new Date().toISOString(),
  })

  const skippedConflicts = plan.conflicts.length
    ? `, skipped conflicts ${plan.conflicts.length}`
    : ''

  applySpinner.succeed(
    chalk.green(
      `Sync complete: remote updated ${updatedRemoteCount}, remote created ${createdRemoteCount}, remote deleted ${deletedRemoteCount}, local wrote ${wroteLocalCount}, local deleted ${deletedLocalCount}${skippedConflicts}`
    )
  )
}

export async function syncLinkedProject(opts: SyncOptions = {}) {
  const root = resolve(opts.dir ?? '.')

  if (opts.watch) {
    if (!opts.yes) {
      console.error(chalk.red('`specdown sync --watch` requires --yes to avoid repeated interactive prompts.'))
      process.exit(1)
    }

    try {
      await runSyncOnce(root, opts)
    } catch (error) {
      if (error instanceof Error && error.message) {
        console.error(chalk.red(error.message))
      }
    }

    console.log(chalk.cyan(`Watching ${root} for changes. Press Ctrl+C to stop.`))

    const watcher = watchLinkedFolder(root, async () => {
      console.log(chalk.gray('Change detected. Running sync…'))
      try {
        await runSyncOnce(root, { ...opts, watch: false, yes: true })
      } catch (error) {
        if (error instanceof Error && error.message) {
          console.error(chalk.red(error.message))
        }
      }
    })

    const stopWatching = () => {
      watcher.close()
      console.log(chalk.gray('\nStopped watch mode.'))
      process.exit(0)
    }

    process.once('SIGINT', stopWatching)
    process.once('SIGTERM', stopWatching)
    await new Promise(() => {})
  }

  try {
    await runSyncOnce(root, opts)
  } catch (error) {
    if (error instanceof Error && error.message) {
      console.error(chalk.red(error.message))
    } else {
      console.error(chalk.red('Sync failed'))
    }
    process.exit(1)
  }
}
