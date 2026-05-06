import chalk from 'chalk'
import ora from 'ora'
import { getClient } from '../lib/api.js'
import { requireAuth, requireProject } from '../lib/config.js'
import { normalizePath } from '../lib/path.js'

interface ListOptions {
  unresolved?: boolean
  json?: boolean
}

type Author = { id: string; full_name: string | null; email: string | null } | null

type CommentRow = {
  id: string
  parent_id: string | null
  content: string
  selection_text: string | null
  resolved: boolean
  created_at: string
  created_by: string | null
  anonymous_name: string | null
  profiles: Author
}

function displayName(c: CommentRow): string {
  if (c.profiles?.full_name) return c.profiles.full_name
  if (c.profiles?.email) return c.profiles.email
  if (c.anonymous_name) return c.anonymous_name
  return 'Anonymous'
}

function formatRelative(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const sec = Math.round(diffMs / 1000)
  if (sec < 60) return `${sec}s ago`
  const min = Math.round(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.round(min / 60)
  if (hr < 24) return `${hr}h ago`
  const d = Math.round(hr / 24)
  if (d < 30) return `${d}d ago`
  return new Date(iso).toLocaleDateString()
}

function indent(text: string, prefix: string): string {
  return text.split('\n').map((line) => prefix + line).join('\n')
}

export async function listComments(pathArg: string, opts: ListOptions) {
  const cfg = requireAuth()
  const project = requireProject(cfg)
  const supabase = await getClient(cfg)
  const spinner = opts.json ? null : ora('Fetching comments…').start()

  try {
    const { data: doc, error: docErr } = await supabase
      .from('documents')
      .select('id, title, full_path')
      .eq('project_id', project.id)
      .eq('is_folder', false)
      .is('deleted_at', null)
      .eq('full_path', normalizePath(pathArg))
      .single()

    if (docErr || !doc) {
      spinner?.fail(chalk.red(`Document not found: ${pathArg}`))
      process.exit(1)
    }

    let query = supabase
      .from('comments')
      .select('id, parent_id, content, selection_text, resolved, created_at, created_by, anonymous_name, profiles!created_by(id, full_name, email)')
      .eq('document_id', doc.id)
      .order('created_at', { ascending: true })

    if (opts.unresolved) query = query.eq('resolved', false)

    const { data, error } = await query
    if (error) {
      spinner?.fail(chalk.red(`Failed to read comments: ${error.message}`))
      process.exit(1)
    }

    const rows = (data ?? []) as unknown as CommentRow[]
    spinner?.stop()

    if (opts.json) {
      console.log(JSON.stringify({ document: doc, comments: rows }, null, 2))
      return
    }

    if (rows.length === 0) {
      console.log(chalk.gray(`# ${doc.full_path}\n`))
      console.log(chalk.gray('No comments yet.'))
      return
    }

    const top = rows.filter((c) => c.parent_id === null)
    const repliesByParent = new Map<string, CommentRow[]>()
    for (const c of rows) {
      if (!c.parent_id) continue
      const arr = repliesByParent.get(c.parent_id) ?? []
      arr.push(c)
      repliesByParent.set(c.parent_id, arr)
    }

    const unresolvedCount = top.filter((c) => !c.resolved).length
    const header = `# ${doc.full_path}  (${rows.length} comment${rows.length === 1 ? '' : 's'}, ${unresolvedCount} unresolved)`
    console.log(chalk.gray(header) + '\n')

    for (const c of top) {
      const tag = c.resolved ? chalk.green('[resolved] ') : ''
      const anon = c.created_by === null ? chalk.gray(' (anonymous)') : ''
      console.log(`${tag}${chalk.bold(displayName(c))}${anon}  ${chalk.gray(formatRelative(c.created_at))}`)
      if (c.selection_text) {
        console.log(chalk.cyan('  > ') + chalk.italic(chalk.gray(c.selection_text)))
      }
      console.log(indent(c.content, '  '))
      const replies = repliesByParent.get(c.id) ?? []
      for (const r of replies) {
        const ranon = r.created_by === null ? chalk.gray(' (anonymous)') : ''
        console.log(chalk.gray('  └─ ') + chalk.bold(displayName(r)) + ranon + '  ' + chalk.gray(formatRelative(r.created_at)))
        console.log(indent(r.content, '     '))
      }
      console.log('')
    }
  } catch (err) {
    spinner?.fail(chalk.red(err instanceof Error ? err.message : 'Failed to list comments'))
    process.exit(1)
  }
}
