import chalk from 'chalk'
import ora from 'ora'
import { getClient } from '../lib/api.js'
import { requireAuth, requireProject } from '../lib/config.js'
import { normalizePath } from '../lib/path.js'

interface NewOptions {
  folder?: boolean
  parent?: string
}

export async function newDoc(title: string, opts: NewOptions) {
  const cfg = requireAuth()
  const project = requireProject(cfg)
  const supabase = await getClient(cfg)
  const spinner = ora('Creating…').start()

  try {
    const slug = title.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
    const docSlug = opts.folder ? slug : `${slug}.md`

    let parentId: string | null = null
    let dirPath = '/'

    if (opts.parent) {
      const parentPath = normalizePath(opts.parent)
      const { data: parentDoc } = await supabase
        .from('documents')
        .select('id, full_path')
        .eq('project_id', project.id)
        .eq('is_folder', true)
        .eq('full_path', parentPath)
        .single()

      if (!parentDoc) {
        spinner.fail(chalk.red(`Parent folder not found: ${opts.parent}`))
        process.exit(1)
      }
      parentId = parentDoc.id
      dirPath = (parentDoc.full_path ?? '') + '/'
    }

    const fullPath = `${dirPath}${docSlug}`

    const { data, error } = await supabase
      .from('documents')
      .insert({
        project_id: project.id,
        created_by: cfg.user_id,
        title,
        slug: docSlug,
        path: dirPath,
        full_path: fullPath,
        is_folder: opts.folder ?? false,
        parent_id: parentId,
        sort_order: 9999,
        content: opts.folder ? null : `# ${title}\n`,
      })
      .select('id, full_path')
      .single()

    if (error) throw error
    spinner.succeed(chalk.green(`Created: ${data.full_path}`))
  } catch {
    spinner.fail(chalk.red('Failed to create document'))
    process.exit(1)
  }
}
