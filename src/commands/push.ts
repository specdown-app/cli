import { readFileSync, existsSync, statSync } from 'fs'
import chalk from 'chalk'
import ora from 'ora'
import { getClient } from '../lib/api.js'
import { requireAuth, requireProject } from '../lib/config.js'

const MAX_FILE_BYTES = 10 * 1024 * 1024 // 10 MB

function normalizePath(p: string) {
  return p.startsWith('/') ? p : `/${p}`
}

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

  const content = readFileSync(filePath, 'utf-8')
  const cfg = requireAuth()
  const project = requireProject(cfg)
  const supabase = getClient(cfg)
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
      const { error } = await supabase
        .from('documents')
        .update({ content, updated_at: new Date().toISOString() })
        .eq('id', existing.id)

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
          full_path: fullPath,
          is_folder: false,
          parent_id: null,
          sort_order: 9999,
          content,
        })

      if (error) throw error
      spinner.succeed(chalk.green(`Created: ${fullPath}`))
    }
  } catch {
    spinner.fail(chalk.red('Push failed'))
    process.exit(1)
  }
}
