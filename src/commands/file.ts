import { basename, dirname, extname, posix as pathPosix } from 'node:path'
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { Command } from 'commander'
import chalk from 'chalk'
import ora from 'ora'
import { getClient } from '../lib/api.js'
import { requireAuth, requireProject } from '../lib/config.js'
import { normalizePath } from '../lib/path.js'

const APP_URL = process.env.SPECDOWN_APP_URL ?? 'https://specdown.app'
const MAX_FILE_BYTES = 50 * 1024 * 1024

const CONTENT_TYPE_BY_EXTENSION: Record<string, string> = {
  '.csv': 'text/csv',
  '.gif': 'image/gif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.json': 'application/json',
  '.md': 'text/markdown',
  '.mdx': 'text/markdown',
  '.mov': 'video/quicktime',
  '.mp4': 'video/mp4',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain',
  '.webm': 'video/webm',
  '.webp': 'image/webp',
}

type ProjectFileResponse = {
  file?: ProjectFileRecord
  files?: ProjectFileRecord[]
  error?: string
}

type ProjectFileRecord = {
  id: string
  title: string
  filename: string
  full_path: string
  mime_type: string
  extension: string | null
  size_bytes: number
  download_url?: string
  embed?: string
  content_text?: string | null
  content_text_excerpt?: string | null
}

async function getAccessToken() {
  const cfg = requireAuth()
  const supabase = await getClient(cfg)
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session?.access_token) {
    throw new Error('Session expired or invalid. Run: specdown login')
  }

  return { cfg, accessToken: session.access_token }
}

function resolveContentType(filePath: string) {
  return CONTENT_TYPE_BY_EXTENSION[extname(filePath).toLowerCase()] ?? 'application/octet-stream'
}

function resolveRemoteTarget(localFilePath: string, remotePath?: string) {
  if (!remotePath) {
    return { directory: '/', filename: basename(localFilePath) }
  }

  if (remotePath.endsWith('/')) {
    return { directory: normalizePath(remotePath), filename: basename(localFilePath) }
  }

  const normalized = normalizePath(remotePath)
  const directory = dirname(normalized)
  const filename = basename(normalized)
  return {
    directory: directory === '.' ? '/' : directory,
    filename: filename || basename(localFilePath),
  }
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

async function requestProjectFiles(path?: string): Promise<ProjectFileResponse> {
  const { cfg, accessToken } = await getAccessToken()
  const project = requireProject(cfg)
  const url = new URL('/api/project-files', APP_URL)
  url.searchParams.set('project_id', project.id)
  if (path) url.searchParams.set('path', normalizePath(path))

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })
  const result = await response.json() as ProjectFileResponse
  if (!response.ok) {
    throw new Error(result.error ?? 'Project file request failed')
  }
  return result
}

async function listProjectFiles(prefix?: string) {
  const spinner = ora('Loading project files...').start()

  try {
    const result = await requestProjectFiles()
    const normalizedPrefix = prefix ? normalizePath(prefix) : null
    const files = (result.files ?? [])
      .filter((file) => !normalizedPrefix || file.full_path === normalizedPrefix || file.full_path.startsWith(`${normalizedPrefix}/`))

    spinner.stop()
    if (files.length === 0) {
      console.log(chalk.gray('No project files found.'))
      return
    }

    for (const file of files) {
      console.log(`${chalk.cyan(file.full_path)} ${chalk.gray(`${file.mime_type} · ${formatBytes(file.size_bytes)}`)}`)
    }
  } catch (err) {
    spinner.fail(chalk.red('Failed to list project files'))
    if (err instanceof Error && err.message) console.error(chalk.dim(err.message))
    process.exit(1)
  }
}

async function uploadProjectFile(localFilePath: string, remotePath?: string) {
  if (!existsSync(localFilePath)) {
    console.error(chalk.red(`File not found: ${localFilePath}`))
    process.exit(1)
  }

  const stat = statSync(localFilePath)
  if (!stat.isFile()) {
    console.error(chalk.red(`Not a file: ${localFilePath}`))
    process.exit(1)
  }

  if (stat.size > MAX_FILE_BYTES) {
    console.error(chalk.red(`File too large (${formatBytes(stat.size)}). Max 50 MB.`))
    process.exit(1)
  }

  const spinner = ora('Uploading project file...').start()

  try {
    const { cfg, accessToken } = await getAccessToken()
    const project = requireProject(cfg)
    const target = resolveRemoteTarget(localFilePath, remotePath)
    const body = new FormData()

    body.append(
      'file',
      new Blob([readFileSync(localFilePath)], { type: resolveContentType(localFilePath) }),
      target.filename
    )
    body.append('project_id', project.id)
    body.append('path', target.directory)

    const response = await fetch(new URL('/api/project-files', APP_URL), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body,
    })
    const result = await response.json() as ProjectFileRecord & { error?: string }

    if (!response.ok || !result.full_path) {
      throw new Error(result.error ?? 'Project file upload failed')
    }

    spinner.succeed(chalk.green(`Uploaded: ${result.full_path}`))
    console.log(result.embed ?? `[@${result.full_path}]`)
    if (result.download_url) {
      console.log(new URL(result.download_url, APP_URL).toString())
    }
  } catch (err) {
    spinner.fail(chalk.red('Project file upload failed'))
    if (err instanceof Error && err.message) console.error(chalk.dim(err.message))
    process.exit(1)
  }
}

async function readProjectFile(remotePath: string, outFile?: string) {
  const spinner = ora('Reading project file...').start()

  try {
    const result = await requestProjectFiles(remotePath)
    const file = result.file
    if (!file) throw new Error(`File not found: ${remotePath}`)

    spinner.stop()

    if (outFile) {
      if (file.content_text != null) {
        writeFileSync(outFile, file.content_text)
      } else if (file.download_url) {
        const { accessToken } = await getAccessToken()
        const response = await fetch(new URL(file.download_url, APP_URL), {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        })
        if (!response.ok) throw new Error(`Download failed: ${response.status}`)
        writeFileSync(outFile, Buffer.from(await response.arrayBuffer()))
      } else {
        throw new Error('No downloadable URL returned for this file')
      }
      console.log(chalk.green(`Wrote ${outFile}`))
      return
    }

    if (file.content_text != null) {
      console.log(file.content_text)
      return
    }

    console.log(JSON.stringify({
      id: file.id,
      path: file.full_path,
      mime_type: file.mime_type,
      size_bytes: file.size_bytes,
      embed: file.embed,
      download_url: file.download_url ? new URL(file.download_url, APP_URL).toString() : null,
    }, null, 2))
  } catch (err) {
    spinner.fail(chalk.red('Failed to read project file'))
    if (err instanceof Error && err.message) console.error(chalk.dim(err.message))
    process.exit(1)
  }
}

export const fileCommand = new Command('file')
  .description('Upload, list, and read preview-only project attachments')

fileCommand
  .command('list [prefix]')
  .description('List preview-only project attachments')
  .action(listProjectFiles)

fileCommand
  .command('upload <local-file> [remote-path]')
  .description('Upload a local file as a project attachment and print its embed link')
  .action(uploadProjectFile)

fileCommand
  .command('read <path> [out-file]')
  .description('Read a project attachment text preview or write it to a local file')
  .action(readProjectFile)
