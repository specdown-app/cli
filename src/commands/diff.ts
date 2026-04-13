import { resolve } from 'path'
import chalk from 'chalk'
import ora from 'ora'

import { requireAuth } from '../lib/config.js'
import { formatConflictSummary, formatSyncPlanSummary } from '../lib/confirmation.js'
import { readLinkManifest } from '../lib/link-config.js'
import { scanLocalTree } from '../lib/local-tree.js'
import { readRemoteTree } from '../lib/remote-tree.js'
import { readSyncState } from '../lib/sync-state.js'
import { buildSyncPlan } from '../lib/sync-plan.js'

interface DiffOptions {
  dir?: string
}

function printGroup(label: string, paths: string[]): void {
  if (!paths.length) return

  console.log(chalk.bold(label))
  for (const path of paths) {
    console.log(`  ${path}`)
  }
}

export async function diffLinkedProject(opts: DiffOptions) {
  const root = resolve(opts.dir ?? '.')
  const cfg = requireAuth()
  const manifest = readLinkManifest(root)
  const spinner = ora(`Diffing ${manifest.projectSlug}…`).start()

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

    printGroup('Push updates', plan.push.map((file) => file.path))
    printGroup('Pull updates', plan.pull.map((file) => file.path))
    printGroup('Create remote', plan.createRemote.map((file) => file.path))
    printGroup('Create local', plan.createLocal.map((file) => file.path))
    printGroup('Delete remote', plan.deleteRemote.map((file) => file.path))
    printGroup('Delete local', plan.deleteLocal.map((file) => file.path))

    if (plan.conflicts.length) {
      console.log(chalk.red(`Conflicts: ${formatConflictSummary(plan)}`))
    }

    if (
      !plan.push.length &&
      !plan.pull.length &&
      !plan.createRemote.length &&
      !plan.createLocal.length &&
      !plan.deleteRemote.length &&
      !plan.deleteLocal.length &&
      !plan.conflicts.length
    ) {
      console.log(chalk.gray('No differences detected.'))
    }
  } catch (error) {
    spinner.fail(chalk.red('Diff failed'))
    if (error instanceof Error && error.message) {
      console.error(chalk.dim(error.message))
    }
    process.exit(1)
  }
}
