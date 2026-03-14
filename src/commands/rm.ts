import chalk from 'chalk'
import ora from 'ora'
import { getClient } from '../lib/api.js'
import { requireAuth, requireProject } from '../lib/config.js'
import { ask } from '../lib/prompt.js'

export async function rm(docPath: string, opts: { force?: boolean }) {
  const cfg = requireAuth()
  const project = requireProject(cfg)
  const supabase = getClient(cfg)
  const spinner = ora(`Looking up ${docPath}…`).start()

  try {
    const { data, error } = await supabase
      .from('documents')
      .select('id, title, is_folder')
      .eq('project_id', project.id)
      .is('deleted_at', null)
      .or(`full_path.eq.${docPath},slug.eq.${docPath}`)
      .single()

    if (error || !data) {
      spinner.fail(chalk.red(`Document not found: ${docPath}`))
      process.exit(1)
    }

    spinner.stop()

    if (!opts.force) {
      const answer = await ask(
        chalk.yellow(`Delete "${data.title}"${data.is_folder ? ' (folder + all children)' : ''}? [y/N] `)
      )
      if (answer.toLowerCase() !== 'y') {
        console.log('Aborted.')
        return
      }
    }

    const deleteSpinner = ora('Deleting…').start()
    const { error: delErr } = await supabase
      .from('documents')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', data.id)

    if (delErr) throw delErr
    deleteSpinner.succeed(chalk.green(`Deleted: ${docPath}`))
  } catch (err) {
    spinner.fail(chalk.red('Delete failed'))
    console.error(err)
    process.exit(1)
  }
}
