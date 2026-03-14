import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

const CONFIG_DIR = join(homedir(), '.specdown')
const CONFIG_FILE = join(CONFIG_DIR, 'config.json')

export interface Config {
  access_token: string
  refresh_token: string
  user_email: string
  user_id: string
  current_project_id?: string
  current_project_slug?: string
  current_project_name?: string
}

export function readConfig(): Config | null {
  if (!existsSync(CONFIG_FILE)) return null
  try {
    return JSON.parse(readFileSync(CONFIG_FILE, 'utf-8')) as Config
  } catch {
    return null
  }
}

export function writeConfig(config: Config): void {
  if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true })
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8')
}

export function clearConfig(): void {
  if (existsSync(CONFIG_FILE)) writeFileSync(CONFIG_FILE, '{}', 'utf-8')
}

export function requireAuth(): Config {
  const cfg = readConfig()
  if (!cfg?.access_token) {
    console.error('Not logged in. Run: specdown login')
    process.exit(1)
  }
  return cfg
}

export function requireProject(cfg: Config): { id: string; slug: string; name: string } {
  if (!cfg.current_project_id || !cfg.current_project_slug) {
    console.error('No project selected. Run: specdown use <project-slug>')
    process.exit(1)
  }
  return {
    id: cfg.current_project_id,
    slug: cfg.current_project_slug,
    name: cfg.current_project_name ?? cfg.current_project_slug,
  }
}
