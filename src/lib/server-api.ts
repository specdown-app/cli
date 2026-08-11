import { getClient } from './api.js'
import { requireAuth } from './config.js'

const APP_URL = process.env.SPECDOWN_APP_URL ?? 'https://specdown.app'

export async function requestServerApi<T>(path: string, init: RequestInit = {}): Promise<T> {
  const cfg = requireAuth()
  const supabase = await getClient(cfg)
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error('Session expired or invalid. Run: specdown login')

  const response = await fetch(new URL(path, APP_URL), {
    ...init,
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  })
  const result = await response.json() as T & { error?: string }
  if (!response.ok) throw new Error(result.error ?? `Request failed (${response.status})`)
  return result
}
