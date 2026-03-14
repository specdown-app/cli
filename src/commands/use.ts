import chalk from 'chalk'
import ora from 'ora'
import { getClient } from '../lib/api.js'
import { readConfig, requireAuth, writeConfig } from '../lib/config.js'

export async function useProject(slug: string) {
  const cfg = requireAuth()
  const supabase = getClient(cfg)
  const spinner = ora(`Switching to project "${slug}"…`).start()

  try {
    const { data, error } = await supabase
      .from('projects')
      .select('id, name, slug')
      .eq('slug', slug)
      .single()

    if (error || !data) {
      spinner.fail(chalk.red(`Project "${slug}" not found.`))
      process.exit(1)
    }

    const current = readConfig() ?? cfg
    writeConfig({
      ...current,
      current_project_id: data.id,
      current_project_slug: data.slug,
      current_project_name: data.name,
    })

    spinner.succeed(chalk.green(`Now using project ${chalk.bold(data.name)}`))
  } catch (err) {
    spinner.fail(chalk.red('Failed to switch project'))
    console.error(err)
    process.exit(1)
  }
}
