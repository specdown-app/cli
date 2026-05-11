// Mirrors the repo-root `skills/` bundle into `cli/skills/` so it ships in
// the npm tarball. Runs as `prebuild` and `predev` — keep it idempotent.

import { rmSync, cpSync, mkdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const cliRoot = join(here, '..')
const source = join(cliRoot, '..', 'skills')
const dest = join(cliRoot, 'skills')

if (!existsSync(source)) {
  console.error(`[copy-skills] Skills source not found at ${source}.`)
  console.error('[copy-skills] Run from a checked-out specdown repo so the cli/ package can mirror /skills.')
  process.exit(1)
}

rmSync(dest, { recursive: true, force: true })
mkdirSync(dest, { recursive: true })
cpSync(source, dest, { recursive: true })
console.log(`[copy-skills] Mirrored ${source} → ${dest}`)
