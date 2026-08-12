import chalk from 'chalk'
import ora from 'ora'
import { requireAuth, requireProject } from '../lib/config.js'
import { normalizePath } from '../lib/path.js'
import { ask } from '../lib/prompt.js'
import { requestServerApi } from '../lib/server-api.js'

type ShareCreateOptions = {
  type?: 'public' | 'private' | 'password'
  password?: string
  emails?: string
  expires?: string
}

type ShareLink = {
  id: string
  url: string
  share_type: string
  expires_at: string | null
  document?: { title: string; full_path: string } | null
}

function activeProject() {
  return requireProject(requireAuth())
}

export async function createShare(path: string | undefined, options: ShareCreateOptions) {
  const project = activeProject()
  const expiresInDays = options.expires ? Number(options.expires) : undefined
  if (options.expires && (!Number.isInteger(expiresInDays) || expiresInDays! < 1 || expiresInDays! > 3650)) {
    console.error(chalk.red('--expires must be a whole number between 1 and 3650 days'))
    process.exitCode = 1
    return
  }

  const spinner = ora('Creating share link…').start()
  try {
    const { link } = await requestServerApi<{ link: ShareLink }>('/api/cli/share-links', {
      method: 'POST',
      body: JSON.stringify({
        projectId: project.id,
        path: path ? normalizePath(path) : undefined,
        shareType: options.type ?? 'public',
        password: options.password,
        allowedEmails: options.emails?.split(',').map((email) => email.trim()).filter(Boolean) ?? [],
        expiresInDays,
      }),
    })
    spinner.succeed(chalk.green('Share link created'))
    console.log(link.url)
    console.log(chalk.dim(`ID: ${link.id}`))
  } catch (error) {
    spinner.fail(chalk.red('Failed to create share link'))
    console.error(chalk.dim(error instanceof Error ? error.message : String(error)))
    process.exitCode = 1
  }
}

export async function listShares() {
  const project = activeProject()
  const spinner = ora('Loading share links…').start()
  try {
    const query = new URLSearchParams({ project_id: project.id })
    const { links } = await requestServerApi<{ links: ShareLink[] }>(`/api/cli/share-links?${query}`)
    spinner.stop()
    if (links.length === 0) {
      console.log(chalk.gray('No share links found.'))
      return
    }
    for (const link of links) {
      const target = link.document?.full_path ?? 'entire project'
      const expiry = link.expires_at ? ` · expires ${link.expires_at.slice(0, 10)}` : ''
      console.log(`${chalk.cyan(link.id)} ${target} · ${link.share_type}${expiry}`)
      console.log(`  ${link.url}`)
    }
  } catch (error) {
    spinner.fail(chalk.red('Failed to list share links'))
    console.error(chalk.dim(error instanceof Error ? error.message : String(error)))
    process.exitCode = 1
  }
}

export async function revokeShare(shareId: string, options: { force?: boolean }) {
  const project = activeProject()
  // --force: Skip confirmation prompt for automation and CI.
  if (!options.force) {
    const answer = await ask(chalk.yellow(`Revoke share link ${shareId}? [y/N] `))
    if (answer.toLowerCase() !== 'y') {
      console.log('Aborted.')
      return
    }
  }

  const spinner = ora('Revoking share link…').start()
  try {
    await requestServerApi('/api/cli/share-links', {
      method: 'DELETE',
      body: JSON.stringify({ projectId: project.id, shareId }),
    })
    spinner.succeed(chalk.green(`Revoked: ${shareId}`))
  } catch (error) {
    spinner.fail(chalk.red('Failed to revoke share link'))
    console.error(chalk.dim(error instanceof Error ? error.message : String(error)))
    process.exitCode = 1
  }
}
