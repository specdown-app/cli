import { basename, extname } from 'node:path'
import { existsSync, readFileSync, statSync } from 'node:fs'
import chalk from 'chalk'
import ora from 'ora'
import { getClient } from '../lib/api.js'
import { requireAuth, requireProject } from '../lib/config.js'
import { normalizePath } from '../lib/path.js'

const APP_URL = process.env.SPECDOWN_APP_URL ?? 'https://specdown.app'
const MAX_FILE_BYTES = 10 * 1024 * 1024

const CONTENT_TYPE_BY_EXTENSION: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
}

interface ImageOptions {
  doc?: string
}

function resolveContentType(filePath: string): string | null {
  return CONTENT_TYPE_BY_EXTENSION[extname(filePath).toLowerCase()] ?? null
}

export async function uploadImage(filePath: string, opts: ImageOptions) {
  if (!existsSync(filePath)) {
    console.error(chalk.red(`File not found: ${filePath}`))
    process.exit(1)
  }

  const stat = statSync(filePath)
  if (stat.size > MAX_FILE_BYTES) {
    console.error(chalk.red(`File too large (${(stat.size / 1024 / 1024).toFixed(1)} MB). Max 10 MB.`))
    process.exit(1)
  }

  const contentType = resolveContentType(filePath)
  if (!contentType) {
    console.error(chalk.red('Unsupported image type. Use png, jpg, jpeg, gif, webp, or svg.'))
    process.exit(1)
  }

  const cfg = requireAuth()
  const project = requireProject(cfg)
  const supabase = await getClient(cfg)
  const spinner = ora('Uploading image…').start()

  try {
    let documentId: string | null = null

    if (opts.doc) {
      const docPath = normalizePath(opts.doc)
      const { data: document, error } = await supabase
        .from('documents')
        .select('id, is_folder')
        .eq('project_id', project.id)
        .eq('full_path', docPath)
        .is('deleted_at', null)
        .single()

      if (error || !document || document.is_folder) {
        throw new Error(`Document not found: ${docPath}`)
      }

      documentId = document.id
    }

    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session?.access_token) {
      throw new Error('Session expired or invalid. Run: specdown login')
    }

    const body = new FormData()
    body.append(
      'file',
      new Blob([readFileSync(filePath)], { type: contentType }),
      basename(filePath)
    )
    body.append('project_id', project.id)

    if (documentId) {
      body.append('document_id', documentId)
    }

    const response = await fetch(`${APP_URL}/api/cli/upload-image`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
      body,
    })

    const result = await response.json() as {
      error?: string
      url?: string
      markdown?: string
    }

    if (!response.ok || !result.url || !result.markdown) {
      throw new Error(result.error ?? 'Image upload failed')
    }

    spinner.succeed(chalk.green(`Uploaded: ${result.url}`))
    console.log(result.markdown)
  } catch (err) {
    spinner.fail(chalk.red('Image upload failed'))
    if (err instanceof Error && err.message) {
      console.error(chalk.dim(err.message))
    }
    process.exit(1)
  }
}
