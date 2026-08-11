import chalk from 'chalk'
import ora from 'ora'
import { readConfig, writeConfig } from '../lib/config.js'
import { requestServerApi } from '../lib/server-api.js'

type CreateProjectOptions = {
  slug?: string
  description?: string
  icon?: string
}

function slugify(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
}

export async function createProject(name: string, options: CreateProjectOptions) {
  const slug = options.slug ?? slugify(name)
  if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
    console.error(chalk.red('Invalid slug. Use lowercase letters, numbers, and hyphens.'))
    process.exitCode = 1
    return
  }

  const spinner = ora('Creating project…').start()
  try {
    const result = await requestServerApi<{
      project: { id: string; name: string; slug: string }
      username: string
    }>('/api/cli/projects', {
      method: 'POST',
      body: JSON.stringify({ name, slug, description: options.description ?? '', icon: options.icon }),
    })

    const cfg = readConfig()
    if (!cfg) throw new Error('Local login config is missing')
    writeConfig({
      ...cfg,
      current_project_id: result.project.id,
      current_project_slug: result.project.slug,
      current_project_name: result.project.name,
    })
    spinner.succeed(chalk.green(`Created and selected: ${result.project.name} (${result.project.slug})`))
    console.log(chalk.dim(`https://specdown.app/${result.username}/${result.project.slug}`))
  } catch (error) {
    spinner.fail(chalk.red('Failed to create project'))
    console.error(chalk.dim(error instanceof Error ? error.message : String(error)))
    process.exitCode = 1
  }
}
