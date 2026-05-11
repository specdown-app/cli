import chalk from 'chalk'
import { createInterface } from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import {
  ALL_TARGETS,
  TARGET_LABELS,
  type ToolTarget,
  refreshUserCache,
  detectTargets,
  installToTarget,
  getSkillsStatus,
} from '../lib/skills.js'

interface InstallSkillsOptions {
  for?: string
}

export async function installSkills(opts: InstallSkillsOptions): Promise<void> {
  console.log(chalk.bold('SpecDown skills installer'))
  console.log()

  // ── Step 1: refresh ~/.specdown/skills/ from the bundled package copy ──
  let cache: { dest: string; count: number }
  try {
    cache = refreshUserCache()
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(chalk.red('Error:'), msg)
    process.exit(1)
  }
  console.log(
    chalk.green('✓'),
    `Synced ${cache.count} skill${cache.count === 1 ? '' : 's'} into ${chalk.cyan(cache.dest)}`,
  )

  // ── Step 2: decide the target AI tool ──────────────────────────────────
  let target: ToolTarget
  if (opts.for) {
    const normalized = opts.for.toLowerCase().trim()
    if (!ALL_TARGETS.includes(normalized as ToolTarget)) {
      console.error(
        chalk.red('Error:'),
        `Unknown target "${opts.for}". Supported: ${ALL_TARGETS.join(', ')}`,
      )
      process.exit(1)
    }
    target = normalized as ToolTarget
  } else {
    target = await promptTarget()
  }

  // ── Step 3: copy cache → target tool directory in cwd ──────────────────
  const cwd = process.cwd()
  const { dest, count } = installToTarget(target, cwd)
  console.log(
    chalk.green('✓'),
    `Installed ${count} skill${count === 1 ? '' : 's'} for ${chalk.bold(target)} → ${chalk.cyan(dest)}`,
  )
  console.log()
  console.log(chalk.dim('Reload your AI tool to pick up the new skills.'))
}

async function promptTarget(): Promise<ToolTarget> {
  const cwd = process.cwd()
  const detected = detectTargets(cwd)
  // Detected targets first (more relevant), then the rest.
  const ordered: ToolTarget[] = [
    ...detected,
    ...ALL_TARGETS.filter((t) => !detected.includes(t)),
  ]

  console.log('Available targets:')
  ordered.forEach((t, i) => {
    const flag = detected.includes(t) ? chalk.dim(' (detected in cwd)') : ''
    console.log(`  ${i + 1}. ${TARGET_LABELS[t]}${flag}`)
  })

  const rl = createInterface({ input, output })
  try {
    const answer = (await rl.question(chalk.bold(`Pick a target [1-${ordered.length}]: `))).trim()
    const n = Number.parseInt(answer, 10)
    if (!Number.isFinite(n) || n < 1 || n > ordered.length) {
      console.error(chalk.red('Invalid choice.'))
      process.exit(1)
    }
    return ordered[n - 1]
  } finally {
    rl.close()
  }
}

export function skillsStatus(): void {
  const status = getSkillsStatus()
  console.log(chalk.bold('SpecDown skills'))
  console.log()
  console.log(`Bundle: ${chalk.cyan(status.bundleDir)}`)
  console.log(`Cache:  ${chalk.cyan(status.cacheDir)}`)
  console.log()
  console.log(chalk.bold('Bundled:'))
  if (status.bundled.length === 0) console.log(chalk.dim('  (none)'))
  for (const s of status.bundled) console.log(`  - ${s.name}`)
  console.log()
  console.log(chalk.bold('Cached:'))
  if (status.cached.length === 0) console.log(chalk.dim('  (run `specdown install skills` to populate)'))
  for (const s of status.cached) console.log(`  - ${s.name}`)
}
