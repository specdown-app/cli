import { existsSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import chalk from 'chalk'
import ora from 'ora'
import { getClient } from '../lib/api.js'
import { requireAuth } from '../lib/config.js'
import { writeLinkManifest } from '../lib/link-config.js'

interface LinkOptions {
  dir?: string
  prefix?: string
}

function normalizeRemotePrefix(prefix: string | undefined): string {
  const value = (prefix ?? '/').trim()
  if (!value || value === '/') return '/'
  return `/${value.replace(/^\/+/, '').replace(/\/+$/, '')}`
}

export async function linkProject(slug: string, opts: LinkOptions) {
  const cfg = requireAuth()
  const supabase = await getClient(cfg)
  const root = resolve(opts.dir ?? '.')

  if (!existsSync(root)) {
    console.error(chalk.red(`Directory not found: ${root}`))
    process.exit(1)
  }

  if (!statSync(root).isDirectory()) {
    console.error(chalk.red(`Not a directory: ${root}`))
    process.exit(1)
  }

  const spinner = ora(`Linking ${root} to project "${slug}"…`).start()

  try {
    const { data, error } = await supabase
      .from('projects')
      .select('id, name, slug')
      .eq('slug', slug)
      .maybeSingle()

    if (error) {
      spinner.fail(chalk.red('Failed to resolve project'))
      console.error(chalk.dim(error.message))
      process.exit(1)
    }

    if (!data) {
      spinner.fail(chalk.red(`Project "${slug}" not found.`))
      process.exit(1)
    }

    writeLinkManifest(root, {
      projectId: data.id,
      projectSlug: data.slug,
      remotePrefix: normalizeRemotePrefix(opts.prefix),
      ignoreGlobs: ['.git/**', 'node_modules/**', '.specdown/**'],
    })

    spinner.succeed(
      chalk.green(`Linked ${chalk.bold(root)} to project ${chalk.bold(data.name)}`)
    )
  } catch (err) {
    spinner.fail(chalk.red('Failed to link project'))
    if (err instanceof Error && err.message) {
      console.error(chalk.dim(err.message))
    }
    process.exit(1)
  }
}
