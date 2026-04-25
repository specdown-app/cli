function normalizeFullPath(fullPath: string) {
  const trimmed = fullPath.trim()
  const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`
  return withLeadingSlash.replace(/\/+/g, '/')
}

function stripMarkdownExtension(filename: string) {
  return filename.replace(/\.(md|markdown|mdx)$/i, '')
}

export function buildDocumentInsertFields(fullPath: string) {
  const normalizedPath = normalizeFullPath(fullPath)
  const parts = normalizedPath.split('/')
  const filename = parts.pop() || 'doc.md'
  const path = parts.length > 1 ? `${parts.join('/')}/` : '/'

  return {
    title: stripMarkdownExtension(filename),
    slug: filename,
    path,
  }
}
