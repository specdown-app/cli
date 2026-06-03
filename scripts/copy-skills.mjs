// Mirrors the repo-root `skills/` bundle into `cli/skills/` so it ships in
// the npm tarball. Runs as `prebuild` and `predev` — keep it idempotent.
//
// The cli/ tree is also published as a standalone GitHub repo (via subtree
// push) to `specdown-app/cli`, where the monorepo's `skills/` sibling no
// longer exists. In that environment we degrade to "keep whatever's already
// in `cli/skills/`" so CI publishes the package with the skills that were
// committed alongside the push, instead of failing the whole build.

import { readdirSync, rmSync, cpSync, mkdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const cliRoot = join(here, '..')
const source = join(cliRoot, '..', 'skills')
const dest = join(cliRoot, 'skills')

function hasContent(dir) {
  if (!existsSync(dir)) return false
  try {
    return readdirSync(dir).some((name) => name !== '.gitkeep')
  } catch {
    return false
  }
}

if (existsSync(source)) {
  rmSync(dest, { recursive: true, force: true })
  mkdirSync(dest, { recursive: true })
  cpSync(source, dest, { recursive: true })
  console.log(`[copy-skills] Mirrored ${source} → ${dest}`)
} else if (hasContent(dest)) {
  console.warn(`[copy-skills] Source ${source} not present — keeping existing ${dest}.`)
  console.warn('[copy-skills] (Expected in the standalone specdown-app/cli repo where the monorepo sibling is absent.)')
} else {
  console.warn(`[copy-skills] No source at ${source} and ${dest} is empty.`)
  console.warn('[copy-skills] Continuing without skills — the published CLI will not bundle them.')
  mkdirSync(dest, { recursive: true })
}
