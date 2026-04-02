import chalk from 'chalk'
import ora from 'ora'
import type { DocRow } from '../lib/api.js'
import { getClient } from '../lib/api.js'
import { requireAuth, requireProject } from '../lib/config.js'

interface TreeNode extends DocRow {
  children: TreeNode[]
}

function buildTree(docs: DocRow[]): TreeNode[] {
  const map = new Map<string, TreeNode>()
  for (const d of docs) map.set(d.id, { ...d, children: [] })

  const roots: TreeNode[] = []
  for (const node of map.values()) {
    if (node.parent_id && map.has(node.parent_id)) {
      map.get(node.parent_id)!.children.push(node)
    } else {
      roots.push(node)
    }
  }

  const sort = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => {
      if (a.is_folder !== b.is_folder) return a.is_folder ? -1 : 1
      if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order
      return a.title.localeCompare(b.title)
    })
    for (const n of nodes) sort(n.children)
  }
  sort(roots)
  return roots
}

function printTree(nodes: TreeNode[], prefix = '') {
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]
    const isLast = i === nodes.length - 1
    const connector = isLast ? '└── ' : '├── '
    const childPrefix = prefix + (isLast ? '    ' : '│   ')

    if (node.is_folder) {
      console.log(prefix + connector + chalk.bold.blue('📁 ' + node.title))
    } else {
      console.log(prefix + connector + chalk.white('📄 ' + node.title) + chalk.gray('  ' + node.path))
    }

    if (node.children.length) printTree(node.children, childPrefix)
  }
}

export async function ls() {
  const cfg = requireAuth()
  const project = requireProject(cfg)
  const supabase = await getClient(cfg)
  const spinner = ora('Loading documents…').start()

  try {
    const { data, error } = await supabase
      .from('documents')
      .select('id, title, slug, path, full_path, is_folder, parent_id, sort_order, updated_at')
      .eq('project_id', project.id)
      .is('deleted_at', null)
      .order('is_folder', { ascending: false })
      .order('sort_order')
      .order('title')

    if (error) throw error
    spinner.stop()

    console.log(chalk.bold(`\n${project.name}\n`))
    if (!data?.length) {
      console.log(chalk.gray('  (empty)'))
      return
    }

    const tree = buildTree(data as DocRow[])
    printTree(tree)
    console.log()
  } catch (err) {
    spinner.fail(chalk.red('Failed to list documents'))
    console.error(err)
    process.exit(1)
  }
}
