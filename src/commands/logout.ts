import chalk from 'chalk'
import { clearConfig, readConfig } from '../lib/config.js'

export function logout() {
  const cfg = readConfig()
  if (!cfg?.access_token) {
    console.log(chalk.yellow('Not logged in.'))
    return
  }
  clearConfig()
  console.log(chalk.green('Logged out.'))
}
