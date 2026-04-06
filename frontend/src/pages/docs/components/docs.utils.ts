import type { DocMeta, TocItem } from './docs.types'
import { defaultDocs } from './docs.data'

export function getDocList(): DocMeta[] {
  return defaultDocs.sort((a, b) => a.order - b.order)
}

export function getDocBySlug(slug: string): DocMeta | undefined {
  return getDocList().find((doc) => doc.slug === slug)
}

export async function loadDocContent(slug: string): Promise<string> {
  try {
    const modules = import.meta.glob('/docs/*.md', { query: '?raw', import: 'default' })
    const path = `/docs/${slug}.md`
    const loader = modules[path]

    if (!loader) {
      throw new Error(`Document not found: ${slug}`)
    }

    const content = await loader()
    return content as string
  } catch (error) {
    console.error('Failed to load doc:', error)
    return `# 文档未找到\n\n未找到 "${slug}" 对应的文档。`
  }
}

export function extractToc(content: string): TocItem[] {
  const toc: TocItem[] = []
  const lines = content.split('\n')
  const idCounts: Record<string, number> = {}

  for (const line of lines) {
    const match = line.match(/^(#{2,3})\s+(.+)$/)
    if (match) {
      const level = match[1].length
      const text = match[2].trim()
      const baseId = text
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, '-')

      // Ensure unique IDs for duplicate headings
      const count = idCounts[baseId] || 0
      const id = count === 0 ? baseId : `${baseId}-${count}`
      idCounts[baseId] = count + 1

      toc.push({ id, text, level })
    }
  }

  return toc
}
