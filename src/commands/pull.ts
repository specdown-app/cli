import { writeFileSync, mkdirSync } from 'fs'
import { dirname } from 'path'
import chalk from 'chalk'
import ora from 'ora'
import { getClient } from '../lib/api.js'
import { requireAuth, requireProject } from '../lib/config.js'

export async function pull(docPath: string, outFile?: string) {
  const cfg = requireAuth()
  const project = requireProject(cfg)
  const supabase = getClient(cfg)
  const spinner = ora(`Pulling ${docPath}…`).start()

  try {
    const { data, error } = await supabase
      .from('documents')
      .select('title, full_path, content')
      .eq('project_id', project.id)
      .eq('is_folder', false)
      .is('deleted_at', null)
      .or(`full_path.eq.${docPath},slug.eq.${docPath}`)
      .single()

    if (error || !data) {
      spinner.fail(chalk.red(`Document not found: ${docPath}`))
      process.exit(1)
    }

    const content = data.content ?? ''

    if (outFile) {
      const dir = dirname(outFile)
      if (dir !== '.') mkdirSync(dir, { recursive: true })
      writeFileSync(outFile, content, 'utf-8')
      spinner.succeed(chalk.green(`Saved to ${outFile}`))
    } else {
      spinner.stop()
      process.stdout.write(content)
    }
  } catch (err) {
    spinner.fail(chalk.red('Pull failed'))
    console.error(err)
    process.exit(1)
  }
}
