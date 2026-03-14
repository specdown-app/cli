import chalk from 'chalk'
import ora from 'ora'
import { getClient } from '../lib/api.js'
import { requireAuth, requireProject } from '../lib/config.js'

interface SearchOptions {
  files?: string
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
  const lower = query.toLowerCase()
  const results: Omit<Match, 'docPath'>[] = []

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

function printContextLine(lineNo: number, line: string) {
  console.log(chalk.gray(String(lineNo).padStart(4) + ' │ ') + chalk.dim(line))
}

export async function search(query: string, opts: SearchOptions) {
  const cfg = requireAuth()
  const project = requireProject(cfg)
  const supabase = getClient(cfg)
  const contextLines = Math.min(parseInt(opts.context ?? '2', 10), 10)

  const spinner = ora('Searching…').start()

  try {
    // Server-side filter with ilike to avoid downloading all docs
    let q = supabase
      .from('documents')
      .select('full_path, slug, content')
      .eq('project_id', project.id)
      .eq('is_folder', false)
      .is('deleted_at', null)
      .ilike('content', `%${query}%`)  // pre-filter on server
      .order('full_path')
      .limit(100)  // hard cap

    if (opts.files) {
      const paths = opts.files.split(',').map((s) => s.trim()).filter(Boolean)
      if (paths.length > 0) {
        q = q.in('full_path', paths.map((p) => p.startsWith('/') ? p : `/${p}`))
      }
    }

    const { data, error } = await q
    if (error) throw error

    spinner.stop()

    const allMatches: Match[] = []

    for (const doc of data ?? []) {
      if (!doc.content) continue
      const hits = searchInContent(doc.content, query, contextLines)
      for (const h of hits) {
        allMatches.push({ docPath: doc.full_path ?? doc.slug, ...h })
      }
    }

    if (!allMatches.length) {
      console.log(chalk.yellow(`No results for "${query}" in ${project.name}`))
      return
    }

    let currentFile = ''
    for (const m of allMatches) {
      if (m.docPath !== currentFile) {
        if (currentFile) console.log()
        currentFile = m.docPath
        console.log(chalk.bold.cyan(`\n📄 ${m.docPath}`))
        console.log(chalk.gray('─'.repeat(50)))
      }

      m.before.forEach((l, i) => printContextLine(m.lineNo - m.before.length + i, l))
      console.log(chalk.green(String(m.lineNo).padStart(4) + ' │ ') + highlight(m.line, query))
      m.after.forEach((l, i) => printContextLine(m.lineNo + 1 + i, l))
      if (m.after.length || m.before.length) console.log(chalk.gray('     ·'))
    }

    const fileCount = new Set(allMatches.map((m) => m.docPath)).size
    console.log()
    console.log(
      chalk.bold(`${allMatches.length} match${allMatches.length === 1 ? '' : 'es'}`) +
      chalk.gray(` across ${fileCount} file${fileCount === 1 ? '' : 's'} in `) +
      chalk.bold(project.name)
    )
  } catch {
    spinner.fail(chalk.red('Search failed'))
    process.exit(1)
  }
}
