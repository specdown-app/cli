import chalk from 'chalk'
import ora from 'ora'
import { getClient } from '../lib/api.js'
import { requireAuth } from '../lib/config.js'

export async function listProjects() {
  const cfg = requireAuth()
  const supabase = await getClient(cfg)
  const spinner = ora('Fetching projects…').start()

  try {
    const { data, error } = await supabase
      .from('projects')
      .select('id, name, slug, updated_at')
      .order('updated_at', { ascending: false })

    if (error) throw error
    spinner.stop()

    if (!data?.length) {
      console.log(chalk.gray('No projects found.'))
      return
    }

    for (const p of data) {
      const isCurrent = p.slug === cfg.current_project_slug
      const marker = isCurrent ? chalk.green('* ') : '  '
      const name = isCurrent ? chalk.bold.green(p.name) : chalk.bold(p.name)
      console.log(`${marker}${name} ${chalk.gray(p.slug)}`)
    }
  } catch (err) {
    spinner.fail(chalk.red('Failed to fetch projects'))
    console.error(err)
    process.exit(1)
  }
}
