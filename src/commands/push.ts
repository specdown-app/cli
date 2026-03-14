import { readFileSync, existsSync } from 'fs'
import chalk from 'chalk'
import ora from 'ora'
import { getClient } from '../lib/api.js'
import { requireAuth, requireProject } from '../lib/config.js'

export async function push(filePath: string, docPath: string) {
  if (!existsSync(filePath)) {
    console.error(chalk.red(`File not found: ${filePath}`))
    process.exit(1)
  }

  const content = readFileSync(filePath, 'utf-8')
  const cfg = requireAuth()
  const project = requireProject(cfg)
  const supabase = getClient(cfg)
  const spinner = ora(`Pushing ${filePath} → ${docPath}…`).start()

  try {
    // Try to find existing doc
    const { data: existing } = await supabase
      .from('documents')
      .select('id')
      .eq('project_id', project.id)
      .eq('is_folder', false)
      .is('deleted_at', null)
      .or(`full_path.eq.${docPath},slug.eq.${docPath}`)
      .single()

    if (existing) {
      const { error } = await supabase
        .from('documents')
        .update({ content, updated_at: new Date().toISOString() })
        .eq('id', existing.id)

      if (error) throw error
      spinner.succeed(chalk.green(`Updated: ${docPath}`))
    } else {
      const slug = docPath.split('/').pop()!.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
      const { error } = await supabase
        .from('documents')
        .insert({
          project_id: project.id,
          title: slug,
          slug,
          path: slug,
          full_path: docPath,
          is_folder: false,
          parent_id: null,
          sort_order: 9999,
          content,
        })

      if (error) throw error
      spinner.succeed(chalk.green(`Created: ${docPath}`))
    }
  } catch (err) {
    spinner.fail(chalk.red('Push failed'))
    console.error(err)
    process.exit(1)
  }
}
