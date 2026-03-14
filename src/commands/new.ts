import chalk from 'chalk'
import ora from 'ora'
import { getClient } from '../lib/api.js'
import { requireAuth, requireProject } from '../lib/config.js'

interface NewOptions {
  folder?: boolean
  parent?: string
}

export async function newDoc(title: string, opts: NewOptions) {
  const cfg = requireAuth()
  const project = requireProject(cfg)
  const supabase = getClient(cfg)
  const spinner = ora('Creating…').start()

  try {
    const slug = title.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')

    let parentId: string | null = null
    if (opts.parent) {
      const { data: parentDoc } = await supabase
        .from('documents')
        .select('id')
        .eq('project_id', project.id)
        .eq('is_folder', true)
        .or(`full_path.eq.${opts.parent},slug.eq.${opts.parent}`)
        .single()

      if (!parentDoc) {
        spinner.fail(chalk.red(`Parent folder not found: ${opts.parent}`))
        process.exit(1)
      }
      parentId = parentDoc.id
    }

    const { data, error } = await supabase
      .from('documents')
      .insert({
        project_id: project.id,
        title,
        slug,
        path: slug,
        full_path: opts.parent ? `${opts.parent}/${slug}` : slug,
        is_folder: opts.folder ?? false,
        parent_id: parentId,
        sort_order: 9999,
        content: opts.folder ? null : `# ${title}\n`,
      })
      .select('id, full_path')
      .single()

    if (error) throw error
    spinner.succeed(chalk.green(`Created: ${data.full_path}`))
  } catch (err) {
    spinner.fail(chalk.red('Failed to create document'))
    console.error(err)
    process.exit(1)
  }
}
