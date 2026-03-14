import chalk from 'chalk'
import ora from 'ora'
import { anonClient } from '../lib/api.js'
import { writeConfig } from '../lib/config.js'
import { ask, askPassword } from '../lib/prompt.js'

export async function login() {
  console.log(chalk.bold('\nSpecDown Login\n'))

  const email = await ask('Email: ')
  const password = await askPassword('Password: ')

  const spinner = ora('Signing in…').start()

  try {
    const supabase = anonClient()
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })

    if (error || !data.session) {
      spinner.fail(chalk.red('Login failed: ' + (error?.message ?? 'No session')))
      process.exit(1)
    }

    const { session, user } = data
    writeConfig({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      user_email: user.email ?? email,
      user_id: user.id,
    })

    spinner.succeed(chalk.green(`Logged in as ${chalk.bold(user.email)}`))
  } catch (err) {
    spinner.fail(chalk.red('Login failed'))
    console.error(err)
    process.exit(1)
  }
}
