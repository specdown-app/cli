import { readFileSync, existsSync, statSync } from 'fs'
import { extname, join, resolve } from 'path'
import { isUtf8 } from 'node:buffer'
import chalk from 'chalk'
import ora from 'ora'
import { getClient } from '../lib/api.js'
import { requireAuth, requireProject, type Config } from '../lib/config.js'
import { shouldProceedWithSync, formatConflictSummary, formatSyncPlanSummary, type SyncPromptArgs } from '../lib/confirmation.js'
import { buildDocumentInsertFields } from '../lib/document-fields.js'
import { readLinkManifest } from '../lib/link-config.js'
import { scanLocalTree } from '../lib/local-tree.js'
import { normalizePath } from '../lib/path.js'
import { readRemoteTree } from '../lib/remote-tree.js'
import { readSyncState, writeSyncState } from '../lib/sync-state.js'
import { buildSyncPlan, type SyncFileSnapshot } from '../lib/sync-plan.js'

const MAX_FILE_BYTES = 10 * 1024 * 1024 // 10 MB
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'])

interface PushOptions extends SyncPromptArgs {
  dir?: string
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

async function pushFile(filePath: string, docPath: string) {
  if (!existsSync(filePath)) {
    console.error(chalk.red(`File not found: ${filePath}`))
    process.exit(1)
  }

  const stat = statSync(filePath)
  if (stat.size > MAX_FILE_BYTES) {
    console.error(chalk.red(`File too large (${(stat.size / 1024 / 1024).toFixed(1)} MB). Max 10 MB.`))
    process.exit(1)
  }

  const extension = extname(filePath).toLowerCase()
  if (IMAGE_EXTENSIONS.has(extension)) {
    console.error(chalk.red('Use `specdown image <file>` for image uploads, then paste the returned markdown into your document.'))
    process.exit(1)
  }

  const raw = readFileSync(filePath)
  if (!isUtf8(raw)) {
    console.error(chalk.red('Binary files are not supported by `specdown push`. Use a UTF-8 text/markdown file.'))
    process.exit(1)
  }

  const content = raw.toString('utf-8')
  const cfg = requireAuth()
  const project = requireProject(cfg)
  const supabase = await getClient(cfg)
  const fullPath = normalizePath(docPath)
  const spinner = ora(`Pushing ${filePath} → ${fullPath}…`).start()

  try {
    const { data: existing, error: lookupError } = await supabase
      .from('documents')
      .select('id')
      .eq('project_id', project.id)
      .eq('is_folder', false)
      .is('deleted_at', null)
      .eq('full_path', fullPath)
      .maybeSingle()

    if (lookupError) throw lookupError

    if (existing) {
      const { error } = await supabase.rpc('save_document', {
        p_document_id: existing.id,
        p_content: content,
        p_commit_message: `specdown push ${fullPath}`,
      })

      if (error) throw error
      spinner.succeed(chalk.green(`Updated: ${fullPath}`))
    } else {
      const { error } = await supabase
        .from('documents')
        .insert(buildRemoteInsertPayload(cfg, project.id, fullPath, content))

      if (error) throw error
      spinner.succeed(chalk.green(`Created: ${fullPath}`))
    }
  } catch (err) {
    spinner.fail(chalk.red('Push failed'))
    if (err instanceof Error && err.message) {
      console.error(chalk.dim(err.message))
    }
    process.exit(1)
  }
}

async function pushLinkedProject(opts: PushOptions) {
  const root = resolve(opts.dir ?? '.')
  const cfg = requireAuth()
  const manifest = readLinkManifest(root)
  const spinner = ora(`Preparing push for ${manifest.projectSlug}…`).start()

  try {
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
          `Conflicts detected: ${formatConflictSummary(plan)}. Re-run with --force to continue syncing non-conflicting push changes.`
        )
      )
      process.exit(1)
    }

    const forcedUpserts = opts.force
      ? plan.conflicts
          .map((item) => item.local)
          .filter((file): file is SyncFileSnapshot => Boolean(file))
      : []
    const forcedDeletes = opts.force
      ? plan.conflicts
          .filter((item) => !item.local && item.remote)
          .map((item) => item.remote as SyncFileSnapshot)
      : []
    const upsertWork = [...plan.push, ...plan.createRemote, ...forcedUpserts]
    const deleteWork = [...plan.deleteRemote, ...forcedDeletes]
    const work = [...upsertWork, ...deleteWork]
    if (!work.length) {
      console.log(chalk.gray('No push changes detected.'))
      return
    }

    const shouldProceed = await shouldProceedWithSync(opts, {
      prompt: `Apply ${work.length} remote change(s) for ${manifest.projectSlug}? [y/N] `,
    })

    if (!shouldProceed) {
      console.log(chalk.gray('Aborted.'))
      return
    }

    const applySpinner = ora('Applying linked-folder push…').start()
    const supabase = await getClient(cfg)
    const remoteByPath = new Map(remoteFiles.map((file) => [file.path, file]))
    let updatedCount = 0
    let createdCount = 0
    let deletedCount = 0

    for (const file of upsertWork) {
      const localPath = createRemotePathToLocalFile(root, manifest.remotePrefix, file.path)
      const content = readFileSync(localPath, 'utf-8')
      const remoteSnapshot = remoteByPath.get(file.path)

      if (remoteSnapshot?.documentId) {
        const { error } = await supabase.rpc('save_document', {
          p_document_id: remoteSnapshot.documentId,
          p_content: content,
          p_commit_message: `specdown push ${file.path}`,
        })

        if (error) throw error
        updatedCount += 1
        continue
      }

      const { error } = await supabase
        .from('documents')
        .insert(buildRemoteInsertPayload(cfg, manifest.projectId, file.path, content))

      if (error) throw error
      createdCount += 1
    }

    for (const file of deleteWork) {
      const documentId = remoteByPath.get(file.path)?.documentId ?? file.documentId
      if (!documentId) continue

      const { error } = await supabase
        .from('documents')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', documentId)

      if (error) throw error
      deletedCount += 1
    }

    const updatedRemoteFiles = await readRemoteTree(cfg, manifest.projectId, manifest.remotePrefix)
    writeSyncState(root, {
      files: updatedRemoteFiles,
      updatedAt: new Date().toISOString(),
    })

    applySpinner.succeed(
      chalk.green(
        `Push complete: updated ${updatedCount}, created ${createdCount}, deleted ${deletedCount}`
      )
    )
  } catch (error) {
    spinner.fail(chalk.red('Push failed'))
    if (error instanceof Error && error.message) {
      console.error(chalk.dim(error.message))
    }
    process.exit(1)
  }
}

export async function push(filePath?: string, docPath?: string, opts: PushOptions = {}) {
  if (filePath && docPath) {
    await pushFile(filePath, docPath)
    return
  }

  if (!filePath && !docPath) {
    await pushLinkedProject(opts)
    return
  }

  console.error(chalk.red('Push expects either <file> <doc-path> or a linked-folder sync with no positional arguments.'))
  process.exit(1)
}
