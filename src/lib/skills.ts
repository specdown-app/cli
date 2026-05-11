import {
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  readFileSync,
  writeFileSync,
  cpSync,
  rmSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// ── Path resolution ────────────────────────────────────────────────────────

/**
 * Resolve the skills folder that ships INSIDE the installed CLI package.
 * Works for both the built bundle (`dist/index.js` next to `skills/`) and
 * the dev mode (`src/lib/skills.ts` two levels up from `cli/skills/`).
 */
export function bundledSkillsDir(): string {
  const here = dirname(fileURLToPath(import.meta.url))
  const candidates = [
    join(here, '..', 'skills'),       // production: <pkg>/dist/ → <pkg>/skills/
    join(here, '..', '..', 'skills'), // dev (tsx):  <pkg>/src/lib/ → <pkg>/skills/
  ]
  for (const c of candidates) {
    if (existsSync(c)) return c
  }
  return candidates[0]
}

/** User-level cache mirroring the bundled skills — `~/.specdown/skills/`. */
export function userCacheSkillsDir(): string {
  return join(homedir(), '.specdown', 'skills')
}

// ── Bundle inspection ──────────────────────────────────────────────────────

export interface SkillEntry {
  name: string
  dir: string
}

function listSkillFolders(root: string): SkillEntry[] {
  if (!existsSync(root)) return []
  return readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => ({ name: e.name, dir: join(root, e.name) }))
}

export function listBundledSkills(): SkillEntry[] {
  return listSkillFolders(bundledSkillsDir())
}

export function listCachedSkills(): SkillEntry[] {
  return listSkillFolders(userCacheSkillsDir())
}

// ── Cache refresh ──────────────────────────────────────────────────────────

/**
 * Copy the bundled skills into the user cache (`~/.specdown/skills/`),
 * replacing any existing copy. Returns the destination + skill count.
 */
export function refreshUserCache(): { source: string; dest: string; count: number } {
  const source = bundledSkillsDir()
  const dest = userCacheSkillsDir()
  if (!existsSync(source)) {
    throw new Error(
      `Bundled skills not found at ${source}.\n` +
        `Reinstall specdown-cli (the package is missing its /skills folder).`,
    )
  }
  rmSync(dest, { recursive: true, force: true })
  mkdirSync(dest, { recursive: true })
  cpSync(source, dest, { recursive: true })
  const count = listSkillFolders(dest).length
  return { source, dest, count }
}

// ── Target adapters ────────────────────────────────────────────────────────

export type ToolTarget =
  | 'claude'
  | 'cursor'
  | 'codex'
  | 'opencode'
  | 'antigravity'
  | 'agents'

export const TARGET_LABELS: Record<ToolTarget, string> = {
  claude: 'Claude Code — .claude/skills/',
  cursor: 'Cursor — .cursor/rules/ (flattened .mdc)',
  codex: 'Codex — .codex/skills/',
  opencode: 'OpenCode — .opencode/skills/',
  antigravity: 'Antigravity — .antigravity/skills/',
  agents: 'Generic (.agents/skills/)',
}

export const ALL_TARGETS: ToolTarget[] = Object.keys(TARGET_LABELS) as ToolTarget[]

export function detectTargets(cwd: string): ToolTarget[] {
  const probe: Array<[ToolTarget, string]> = [
    ['claude', '.claude'],
    ['cursor', '.cursor'],
    ['codex', '.codex'],
    ['opencode', '.opencode'],
    ['antigravity', '.antigravity'],
    ['agents', '.agents'],
  ]
  return probe.filter(([, dir]) => existsSync(join(cwd, dir))).map(([tag]) => tag)
}

/**
 * Copy the user cache into the AI tool's expected directory under `cwd`.
 * For Cursor, flattens each skill's SKILL.md into a single .mdc file.
 * Returns the destination directory + skill count installed.
 */
export function installToTarget(target: ToolTarget, cwd: string): { dest: string; count: number } {
  const cached = listCachedSkills()
  if (cached.length === 0) {
    throw new Error('No cached skills found. The cache should have been populated already — check refreshUserCache().')
  }

  if (target === 'cursor') {
    const dest = join(cwd, '.cursor', 'rules')
    mkdirSync(dest, { recursive: true })
    let count = 0
    for (const skill of cached) {
      const skillFile = join(skill.dir, 'SKILL.md')
      if (!existsSync(skillFile)) continue
      writeFileSync(join(dest, `${skill.name}.mdc`), readFileSync(skillFile), 'utf-8')
      count++
    }
    return { dest, count }
  }

  // Folder-per-skill targets (claude, codex, opencode, antigravity, agents)
  const subdir = `.${target}`
  const dest = join(cwd, subdir, 'skills')
  mkdirSync(dest, { recursive: true })
  let count = 0
  for (const skill of cached) {
    const targetDir = join(dest, skill.name)
    rmSync(targetDir, { recursive: true, force: true })
    cpSync(skill.dir, targetDir, { recursive: true })
    count++
  }
  return { dest, count }
}

// ── Status summary ─────────────────────────────────────────────────────────

export interface SkillsStatus {
  bundled: SkillEntry[]
  cached: SkillEntry[]
  cacheDir: string
  bundleDir: string
}

export function getSkillsStatus(): SkillsStatus {
  return {
    bundled: listBundledSkills(),
    cached: listCachedSkills(),
    cacheDir: userCacheSkillsDir(),
    bundleDir: bundledSkillsDir(),
  }
}

// Touch unused-ish import so tree-shaker doesn't drop fs APIs in some configs.
void statSync
