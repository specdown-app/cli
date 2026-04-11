import { readFileSync, existsSync, statSync } from 'fs'
import { extname } from 'path'
import { isUtf8 } from 'node:buffer'
import chalk from 'chalk'
import ora from 'ora'
import { getClient } from '../lib/api.js'
import { requireAuth, requireProject } from '../lib/config.js'
import { normalizePath } from '../lib/path.js'

const MAX_FILE_BYTES = 10 * 1024 * 1024 // 10 MB
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'])

export async function push(filePath: string, docPath: string) {
  if (!existsSync(filePath)) {
    console.error(chalk.red(`File not found: ${filePath}`))
    process.exit(1)
  }

  const stat = statSync(filePath)
  if (stat.size > MAX_FILE_BYTES) {
    console.error(chalk.red(`File too large (${(stat.size / 1024 / 1024).toFixed(1)} MB). Max 10 MB.`))
    process.exit(1)
  }

  const extension = extname(filePath).toLowerCase()
  if (IMAGE_EXTENSIONS.has(extension)) {
    console.error(chalk.red('Use `specdown image <file>` for image uploads, then paste the returned markdown into your document.'))
    process.exit(1)
  }

  const raw = readFileSync(filePath)
  if (!isUtf8(raw)) {
    console.error(chalk.red('Binary files are not supported by `specdown push`. Use a UTF-8 text/markdown file.'))
    process.exit(1)
  }

  const content = raw.toString('utf-8')
  const cfg = requireAuth()
  const project = requireProject(cfg)
  const supabase = await getClient(cfg)
  const fullPath = normalizePath(docPath)
  const spinner = ora(`Pushing ${filePath} → ${fullPath}…`).start()

  try {
    const { data: existing } = await supabase
      .from('documents')
      .select('id')
      .eq('project_id', project.id)
      .eq('is_folder', false)
      .is('deleted_at', null)
      .eq('full_path', fullPath)
      .single()

    if (existing) {
      const { error } = await supabase.rpc('save_document', {
        p_document_id: existing.id,
        p_content: content,
        p_commit_message: `specdown push ${fullPath}`,
      })

      if (error) throw error
      spinner.succeed(chalk.green(`Updated: ${fullPath}`))
    } else {
      const parts = fullPath.split('/')
      const filename = parts.pop() ?? 'doc.md'
      const dirPath = parts.length > 1 ? parts.join('/') + '/' : '/'
      const slug = filename.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9.-]/g, '')

      const { error } = await supabase
        .from('documents')
        .insert({
          project_id: project.id,
          created_by: cfg.user_id,
          title: slug.replace(/\.md$/, ''),
          slug,
          path: dirPath,
          is_folder: false,
          parent_id: null,
          sort_order: 9999,
          content,
        })

      if (error) throw error
      spinner.succeed(chalk.green(`Created: ${fullPath}`))
    }
  } catch (err) {
    spinner.fail(chalk.red('Push failed'))
    if (err instanceof Error && err.message) {
      console.error(chalk.dim(err.message))
    }
    process.exit(1)
  }
}
