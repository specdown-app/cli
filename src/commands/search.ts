import chalk from 'chalk'
import ora from 'ora'
import { getClient } from '../lib/api.js'
import { requireAuth, requireProject } from '../lib/config.js'

interface SearchOptions {
  /** Comma-separated doc paths/slugs to restrict search */
  files?: string
  /** Show N lines of context around each match (default 2) */
  context?: string
}

interface Match {
  docPath: string
  lineNo: number
  line: string
  before: string[]
  after: string[]
}

function searchInContent(content: string, query: string, contextLines: number): Omit<Match, 'docPath'>[] {
  const lines = content.split('\n')
  const results: Omit<Match, 'docPath'>[] = []
  const lower = query.toLowerCase()

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].toLowerCase().includes(lower)) {
      results.push({
        lineNo: i + 1,
        line: lines[i],
        before: lines.slice(Math.max(0, i - contextLines), i),
        after: lines.slice(i + 1, Math.min(lines.length, i + 1 + contextLines)),
      })
    }
  }
  return results
}

function highlight(line: string, query: string): string {
  const idx = line.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return line
  return (
    line.slice(0, idx) +
    chalk.bgYellow.black(line.slice(idx, idx + query.length)) +
    line.slice(idx + query.length)
  )
}

function printContextLine(lineNo: number, line: string, dim = true) {
  const num = chalk.gray(String(lineNo).padStart(4) + ' │ ')
  console.log(num + (dim ? chalk.dim(line) : line))
}

export async function search(query: string, opts: SearchOptions) {
  const cfg = requireAuth()
  const project = requireProject(cfg)
  const supabase = getClient(cfg)
  const contextLines = parseInt(opts.context ?? '2', 10)

  const spinner = ora('Searching…').start()

  try {
    let q = supabase
      .from('documents')
      .select('full_path, slug, content')
      .eq('project_id', project.id)
      .eq('is_folder', false)
      .is('deleted_at', null)

    // Restrict to specific files if --files provided
    if (opts.files) {
      const paths = opts.files.split(',').map((s) => s.trim())
      const orClauses = paths.flatMap((p) => [`full_path.eq.${p}`, `slug.eq.${p}`]).join(',')
      q = q.or(orClauses)
    }

    const { data, error } = await q.order('full_path')
    if (error) throw error

    spinner.stop()

    let totalMatches = 0
    const allMatches: Match[] = []

    for (const doc of data ?? []) {
      if (!doc.content) continue
      const hits = searchInContent(doc.content, query, contextLines)
      for (const h of hits) {
        allMatches.push({ docPath: doc.full_path ?? doc.slug, ...h })
      }
      totalMatches += hits.length
    }

    if (!allMatches.length) {
      console.log(chalk.yellow(`No results for "${query}" in ${project.name}`))
      return
    }

    // Group and print by file
    let currentFile = ''
    for (const m of allMatches) {
      if (m.docPath !== currentFile) {
        if (currentFile) console.log()
        currentFile = m.docPath
        console.log(chalk.bold.cyan(`\n📄 ${m.docPath}`))
        console.log(chalk.gray('─'.repeat(50)))
      }

      // Context before
      m.before.forEach((l, i) =>
        printContextLine(m.lineNo - m.before.length + i, l)
      )
      // Matching line
      const num = chalk.green(String(m.lineNo).padStart(4) + ' │ ')
      console.log(num + highlight(m.line, query))
      // Context after
      m.after.forEach((l, i) => printContextLine(m.lineNo + 1 + i, l))

      if (m.after.length || m.before.length) {
        console.log(chalk.gray('     ·'))
      }
    }

    console.log()
    console.log(
      chalk.bold(`${totalMatches} match${totalMatches === 1 ? '' : 'es'}`) +
        chalk.gray(` across ${new Set(allMatches.map((m) => m.docPath)).size} file(s) in `) +
        chalk.bold(project.name)
    )
  } catch (err) {
    spinner.fail(chalk.red('Search failed'))
    console.error(err)
    process.exit(1)
  }
}
