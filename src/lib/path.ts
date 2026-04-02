export function normalizePath(p: string): string {
  return p.startsWith('/') ? p : `/${p}`
}
