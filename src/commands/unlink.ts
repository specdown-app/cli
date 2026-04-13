import { resolve } from 'node:path'
import chalk from 'chalk'
import { hasLinkManifest, removeLinkManifest } from '../lib/link-config.js'
import { ask } from '../lib/prompt.js'

interface UnlinkOptions {
  dir?: string
}

export async function unlinkProject(opts: UnlinkOptions) {
  const root = resolve(opts.dir ?? '.')

  if (!hasLinkManifest(root)) {
    console.error(chalk.red(`No SpecDown link found in ${root}`))
    process.exit(1)
  }

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    console.error(chalk.red('Unlink requires an interactive terminal confirmation.'))
    process.exit(1)
  }

  const answer = await ask(`Remove the SpecDown link from ${root}? [y/N] `)
  if (!['y', 'yes'].includes(answer.toLowerCase())) {
    console.log(chalk.gray('Aborted.'))
    return
  }

  const removed = removeLinkManifest(root)
  if (!removed) {
    console.error(chalk.red('Failed to remove SpecDown link manifest'))
    process.exit(1)
  }

  console.log(chalk.green(`Removed SpecDown link from ${root}`))
}
