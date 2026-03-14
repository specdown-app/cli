import chalk from 'chalk'
import ora from 'ora'
import { getClient } from '../lib/api.js'
import { requireAuth, requireProject } from '../lib/config.js'
import { ask } from '../lib/prompt.js'

function normalizePath(p: string) {
  return p.startsWith('/') ? p : `/${p}`
}

export async function rm(docPath: string, opts: { force?: boolean }) {
  const cfg = requireAuth()
  const project = requireProject(cfg)
  const supabase = getClient(cfg)
  const fullPath = normalizePath(docPath)
  const spinner = ora(`Looking up ${fullPath}…`).start()

  try {
    const { data, error } = await supabase
      .from('documents')
      .select('id, title, is_folder')
      .eq('project_id', project.id)
      .is('deleted_at', null)
      .eq('full_path', fullPath)
      .single()

    if (error || !data) {
      spinner.fail(chalk.red(`Document not found: ${fullPath}`))
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
    deleteSpinner.succeed(chalk.green(`Deleted: ${fullPath}`))
  } catch {
    spinner.fail(chalk.red('Delete failed'))
    process.exit(1)
  }
}
