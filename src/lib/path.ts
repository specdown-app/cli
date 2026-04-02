export function normalizePath(p: string): string {
  const trimmed = p.trim()
  const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`
  const normalized = withLeadingSlash.replace(/\/+/g, '/')

  if (normalized === '/') {
    return normalized
  }

  return normalized.endsWith('/') ? normalized.slice(0, -1) : normalized
}
