import chalk from 'chalk'
import ora from 'ora'
import { getClient } from '../lib/api.js'
import { requireAuth, requireProject } from '../lib/config.js'

interface ReadOptions {
  /** Start line (1-based, inclusive) */
  from?: string
  /** End line (1-based, inclusive) */
  to?: string
  /** Show line numbers */
  lineNumbers?: boolean
}

export async function readDoc(pathArg: string, opts: ReadOptions) {
  const cfg = requireAuth()
  const project = requireProject(cfg)
  const supabase = getClient(cfg)
  const spinner = ora('Fetching document…').start()

  try {
    const { data, error } = await supabase
      .from('documents')
      .select('title, full_path, content, updated_at')
      .eq('project_id', project.id)
      .eq('is_folder', false)
      .is('deleted_at', null)
      .or(`full_path.eq.${pathArg},slug.eq.${pathArg}`)
      .single()

    if (error || !data) {
      spinner.fail(chalk.red(`Document not found: ${pathArg}`))
      process.exit(1)
    }

    spinner.stop()

    const rawLines = (data.content ?? '').split('\n')
    const totalLines = rawLines.length

    const fromLine = opts.from ? Math.max(1, parseInt(opts.from, 10)) : 1
    const toLine = opts.to ? Math.min(totalLines, parseInt(opts.to, 10)) : totalLines

    if (fromLine > toLine) {
      console.error(chalk.red(`Invalid range: --from ${fromLine} is after --to ${toLine}`))
      process.exit(1)
    }

    const selectedLines = rawLines.slice(fromLine - 1, toLine)
    const rangeLabel =
      fromLine === 1 && toLine === totalLines
        ? `${totalLines} lines`
        : `lines ${fromLine}–${toLine} of ${totalLines}`

    console.log(
      chalk.gray(`# ${data.full_path}  (${rangeLabel}, updated ${new Date(data.updated_at).toLocaleString()})\n`)
    )

    if (opts.lineNumbers) {
      const padWidth = String(toLine).length
      selectedLines.forEach((line, i) => {
        const lineNo = chalk.gray(String(fromLine + i).padStart(padWidth) + '  ')
        console.log(lineNo + line)
      })
    } else {
      console.log(selectedLines.join('\n'))
    }
  } catch (err) {
    spinner.fail(chalk.red('Failed to read document'))
    console.error(err)
    process.exit(1)
  }
}
