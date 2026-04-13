import chalk from 'chalk'
import ora from 'ora'
import { resolve } from 'node:path'

import { requireAuth } from '../lib/config.js'
import { readLinkManifest } from '../lib/link-config.js'
import { scanLocalTree } from '../lib/local-tree.js'
import { readRemoteTree } from '../lib/remote-tree.js'
import { readSyncState } from '../lib/sync-state.js'
import { buildSyncPlan } from '../lib/sync-plan.js'

interface StatusOptions {
  dir?: string
}

export async function status(opts: StatusOptions) {
  const root = resolve(opts.dir ?? '.')
  const cfg = requireAuth()
  const manifest = readLinkManifest(root)
  const spinner = ora(`Checking sync status for ${manifest.projectSlug}…`).start()

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
    console.log(
      `local ${localFiles.length}, remote ${remoteFiles.length}, tracked ${state.files.length}`
    )
    console.log(
      `push ${plan.push.length}, pull ${plan.pull.length}, create-remote ${plan.createRemote.length}, create-local ${plan.createLocal.length}, delete-remote ${plan.deleteRemote.length}, delete-local ${plan.deleteLocal.length}, conflicts ${plan.conflicts.length}`
    )

    if (plan.conflicts.length) {
      console.log(chalk.red(`conflicts: ${plan.conflicts.map((item) => item.path).join(', ')}`))
    }
  } catch (error) {
    spinner.fail(chalk.red('Failed to read sync status'))
    console.error(error)
    process.exit(1)
  }
}
