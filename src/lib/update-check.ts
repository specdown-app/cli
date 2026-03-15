import chalk from 'chalk'

const PKG_NAME = 'specdown-cli'
const REGISTRY_URL = `https://registry.npmjs.org/${PKG_NAME}/latest`

function compareVersions(current: string, latest: string): boolean {
  const parse = (v: string) => v.split('.').map(Number)
  const [cMaj, cMin, cPat] = parse(current)
  const [lMaj, lMin, lPat] = parse(latest)
  if (lMaj !== cMaj) return lMaj > cMaj
  if (lMin !== cMin) return lMin > cMin
  return lPat > cPat
}

/** Fire-and-forget: prints upgrade notice after command finishes if outdated. */
export function checkForUpdate(current: string): void {
  // Skip if running via npx (always latest) or in CI
  if (process.env.npm_lifecycle_event === 'npx' || process.env.CI) return

  // Throttle: store last-checked time in env to avoid hitting registry on every command.
  // We do a best-effort fire-and-forget — no error surfaced to user.
  setImmediate(async () => {
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 3000)

      const res = await fetch(REGISTRY_URL, { signal: controller.signal })
      clearTimeout(timeout)

      if (!res.ok) return

      const data = await res.json() as { version: string }
      const latest = data.version

      if (compareVersions(current, latest)) {
        // Print after a tiny delay so it appears below the command output
        setTimeout(() => {
          console.error(
            '\n' +
            chalk.yellow('┌─ Update available ') +
            chalk.dim(`${current}`) +
            chalk.yellow(' → ') +
            chalk.green(latest) +
            chalk.yellow(' ─────────────────────────') +
            '\n' +
            chalk.yellow('│ ') + chalk.bold('npm install -g specdown-cli') +
            '\n' +
            chalk.yellow('└────────────────────────────────────────────────') +
            '\n',
          )
        }, 50)
      }
    } catch {
      // Silently ignore — network errors must never disrupt commands
    }
  })
}
