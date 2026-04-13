import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'fs'
import { dirname, join, resolve } from 'path'
import chalk from 'chalk'
import ora from 'ora'
import { getClient } from '../lib/api.js'
import { shouldProceedWithSync, formatConflictSummary, formatSyncPlanSummary, type SyncPromptArgs } from '../lib/confirmation.js'
import { requireAuth, requireProject } from '../lib/config.js'
import { readLinkManifest } from '../lib/link-config.js'
import { normalizePath } from '../lib/path.js'
import { readRemoteTree } from '../lib/remote-tree.js'
import { readSyncState, writeSyncState } from '../lib/sync-state.js'
import { buildSyncPlan, type SyncFileSnapshot } from '../lib/sync-plan.js'
import { scanLocalTree } from '../lib/local-tree.js'

interface PullOptions extends SyncPromptArgs {
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

async function pullFile(docPath: string, outFile?: string) {
  const cfg = requireAuth()
  const project = requireProject(cfg)
  const supabase = await getClient(cfg)
  const spinner = ora(`Pulling ${docPath}…`).start()

  try {
    const { data, error } = await supabase
      .from('documents')
      .select('title, full_path, content')
      .eq('project_id', project.id)
      .eq('is_folder', false)
      .is('deleted_at', null)
      .eq('full_path', normalizePath(docPath))
      .maybeSingle()

    if (error) {
      throw error
    }

    if (!data) {
      spinner.fail(chalk.red(`Document not found: ${docPath}`))
      process.exit(1)
    }

    const content = data.content ?? ''

    if (outFile) {
      const dir = dirname(outFile)
      if (dir !== '.') mkdirSync(dir, { recursive: true })
      writeFileSync(outFile, content, 'utf-8')
      spinner.succeed(chalk.green(`Saved to ${outFile}`))
    } else {
      spinner.stop()
      process.stdout.write(content)
    }
  } catch (error) {
    spinner.fail(chalk.red('Pull failed'))
    if (error instanceof Error && error.message) {
      console.error(chalk.dim(error.message))
    }
    process.exit(1)
  }
}

async function pullLinkedProject(opts: PullOptions) {
  const root = resolve(opts.dir ?? '.')
  const cfg = requireAuth()
  const manifest = readLinkManifest(root)
  const spinner = ora(`Preparing pull for ${manifest.projectSlug}…`).start()

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
          `Conflicts detected: ${formatConflictSummary(plan)}. Re-run with --force to continue syncing non-conflicting pull changes.`
        )
      )
      process.exit(1)
    }

    const forcedPulls = opts.force
      ? plan.conflicts
          .map((item) => item.remote)
          .filter((file): file is SyncFileSnapshot => Boolean(file))
      : []
    const forcedDeletes = opts.force
      ? plan.conflicts
          .filter((item) => !item.remote && item.local)
          .map((item) => item.local as SyncFileSnapshot)
      : []
    const pullWork = [...plan.pull, ...plan.createLocal, ...forcedPulls]
    const deleteWork = [...plan.deleteLocal, ...forcedDeletes]
    const work = [...pullWork, ...deleteWork]
    if (!work.length) {
      console.log(chalk.gray('No pull changes detected.'))
      return
    }

    const shouldProceed = await shouldProceedWithSync(opts, {
      prompt: `Apply ${work.length} local change(s) for ${manifest.projectSlug}? [y/N] `,
    })

    if (!shouldProceed) {
      console.log(chalk.gray('Aborted.'))
      return
    }

    const applySpinner = ora('Applying linked-folder pull…').start()
    const supabase = await getClient(cfg)
    const pullTargets = pullWork.map((file) => file.path)
    let writtenCount = 0
    let deletedCount = 0

    if (pullTargets.length) {
      const { data, error } = await supabase
        .from('documents')
        .select('full_path, content')
        .eq('project_id', manifest.projectId)
        .eq('is_folder', false)
        .is('deleted_at', null)
        .in('full_path', pullTargets)

      if (error) throw error

      const remoteContentByPath = new Map(
        (data ?? []).map((doc) => [normalizePath(doc.full_path), doc.content ?? ''])
      )

      for (const file of pullWork) {
        const content = remoteContentByPath.get(file.path)
        if (content === undefined) {
          throw new Error(`Remote document not found during pull: ${file.path}`)
        }

        const outFile = createRemotePathToLocalFile(root, manifest.remotePrefix, file.path)
        const dir = dirname(outFile)
        if (dir !== '.') mkdirSync(dir, { recursive: true })
        writeFileSync(outFile, content, 'utf-8')
        writtenCount += 1
      }
    }

    for (const file of deleteWork) {
      const localPath = createRemotePathToLocalFile(root, manifest.remotePrefix, file.path)
      if (existsSync(localPath)) {
        unlinkSync(localPath)
        deletedCount += 1
      }
    }

    const updatedRemoteFiles = await readRemoteTree(cfg, manifest.projectId, manifest.remotePrefix)
    writeSyncState(root, {
      files: updatedRemoteFiles,
      updatedAt: new Date().toISOString(),
    })

    applySpinner.succeed(
      chalk.green(
        `Pull complete: wrote ${writtenCount}, deleted ${deletedCount}`
      )
    )
  } catch (error) {
    spinner.fail(chalk.red('Pull failed'))
    if (error instanceof Error && error.message) {
      console.error(chalk.dim(error.message))
    }
    process.exit(1)
  }
}

export async function pull(docPath?: string, outFile?: string, opts: PullOptions = {}) {
  if (docPath) {
    await pullFile(docPath, outFile)
    return
  }

  await pullLinkedProject(opts)
}
