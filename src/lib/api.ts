import { createClient } from '@supabase/supabase-js'
import type { Config } from './config.js'

// Public credentials — safe to bundle (same as NEXT_PUBLIC_* in the web app)
const SUPABASE_URL = 'https://zjvjdalqgrxdhefqqifd.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_y-O0ly4bNH0G4KJii3m25g_WXujFZDo'

export function getClient(cfg: Config) {
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  })
  client.auth.setSession({
    access_token: cfg.access_token,
    refresh_token: cfg.refresh_token,
  })
  return client
}

export function anonClient() {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  })
}

export type DocRow = {
  id: string
  title: string
  slug: string
  path: string
  full_path: string
  is_folder: boolean
  parent_id: string | null
  sort_order: number
  updated_at: string
  content?: string
}
