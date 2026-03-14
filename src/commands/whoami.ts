import chalk from 'chalk'
import { requireAuth } from '../lib/config.js'

export function whoami() {
  const cfg = requireAuth()
  console.log(chalk.bold(cfg.user_email))
  console.log(chalk.gray('ID: ') + cfg.user_id)
  if (cfg.current_project_name) {
    console.log(chalk.gray('Project: ') + cfg.current_project_name + chalk.gray(` (${cfg.current_project_slug})`))
  }
}
