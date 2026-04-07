import type { DocMeta, TocItem } from './docs.types'
import { defaultDocs } from './docs.data'
import { default as Slugger } from 'github-slugger'

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
  const slugger = new Slugger()

  for (const line of lines) {
    const match = line.match(/^(#{2,3})\s+(.+)$/)
    if (match) {
      const level = match[1].length
      const text = match[2].trim()
      const id = slugger.slug(text)
      toc.push({ id, text, level })
    }
  }

  return toc
}
