import { watch, type FSWatcher } from 'node:fs'
import { resolve } from 'node:path'

const IGNORED_PREFIXES = ['.git/', '.specdown/', 'node_modules/']

export interface WatchHandle {
  close(): void
}

interface WatchOptions {
  debounceMs?: number
  watchImpl?: (
    root: string,
    options: { recursive?: boolean },
    listener: (eventType: string, filename: string | Buffer | null) => void
  ) => Pick<FSWatcher, 'close'>
}

export function shouldIgnoreWatchPath(filename: string | Buffer | null | undefined): boolean {
  const value = typeof filename === 'string'
    ? filename
    : Buffer.isBuffer(filename)
      ? filename.toString('utf-8')
      : ''

  if (!value) return false

  const normalized = value.replace(/\\/g, '/').replace(/^\/+/, '')
  return IGNORED_PREFIXES.some((prefix) => normalized === prefix.slice(0, -1) || normalized.startsWith(prefix))
}

export function watchLinkedFolder(
  root: string,
  onChange: () => Promise<void>,
  options: WatchOptions = {}
): WatchHandle {
  const debounceMs = options.debounceMs ?? 250
  const watchImpl = options.watchImpl ?? ((watchRoot, watchOptions, listener) =>
    watch(watchRoot, watchOptions, listener))

  let timer: ReturnType<typeof setTimeout> | undefined
  let closed = false
  let running = false
  let pending = false

  const run = async () => {
    if (closed) return
    if (running) {
      pending = true
      return
    }

    running = true
    try {
      await onChange()
    } finally {
      running = false
      if (pending) {
        pending = false
        schedule()
      }
    }
  }

  const schedule = () => {
    if (closed) return
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = undefined
      void run()
    }, debounceMs)
  }

  const watcher = watchImpl(resolve(root), { recursive: true }, (_eventType, filename) => {
    if (shouldIgnoreWatchPath(filename)) return
    schedule()
  })

  return {
    close() {
      closed = true
      if (timer) {
        clearTimeout(timer)
        timer = undefined
      }
      watcher.close()
    },
  }
}
