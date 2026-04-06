import { useState, useEffect } from 'react'
import { ChevronLeft } from 'lucide-react'
import { Link, useOutletContext } from 'react-router'
import { cn } from '@/lib/utils'
import { ScrollArea } from '@/components/ui/scroll-area'
import { DocSidebar } from './DocSidebar'
import { TableOfContents } from './TableOfContents'
import { MarkdownContent } from './MarkdownContent'
import { getDocList, loadDocContent, extractToc } from './docs.utils'
import type { DocMeta, TocItem } from './docs.types'

interface DocLayoutProps {
  slug: string
}

interface OutletContext {
  sidebarOpen: boolean
  setSidebarOpen: (open: boolean) => void
}

export function DocLayout({ slug }: DocLayoutProps) {
  const [docs] = useState<DocMeta[]>(getDocList())
  const [content, setContent] = useState<string>('')
  const [toc, setToc] = useState<TocItem[]>([])
  const [loading, setLoading] = useState(true)
  const { sidebarOpen, setSidebarOpen } = useOutletContext<OutletContext>()

  useEffect(() => {
    const loadContent = async () => {
      setLoading(true)
      try {
        const rawContent = await loadDocContent(slug)
        setContent(rawContent)
        setToc(extractToc(rawContent))
      } finally {
        setLoading(false)
      }
    }

    loadContent()
    window.scrollTo(0, 0)
  }, [slug])

  return (
    <>
      {/* Main Content */}
      <div className="flex flex-1">
        {/* Mobile Sidebar Overlay */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/50 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Left Sidebar - Navigation */}
        <aside
          className={cn(
            'fixed inset-y-0 left-0 z-50 w-64 transform border-r bg-background pt-14 transition-transform lg:static lg:translate-x-0',
            sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          )}
        >
          <ScrollArea className="h-full py-4">
            <div className="px-4">
              <DocSidebar docs={docs} />
            </div>
          </ScrollArea>
        </aside>

        {/* Middle - Content */}
        <main className="flex-1 px-4 py-8">
          <div className="mx-auto max-w-3xl">
            <Link
              to="/"
              className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
              viewTransition
            >
              <ChevronLeft className="size-4" />
              返回首页
            </Link>

            {loading ? (
              <div className="space-y-4">
                <div className="h-8 w-1/3 animate-pulse rounded bg-muted" />
                <div className="h-4 w-full animate-pulse rounded bg-muted" />
                <div className="h-4 w-5/6 animate-pulse rounded bg-muted" />
                <div className="h-4 w-4/6 animate-pulse rounded bg-muted" />
              </div>
            ) : (
              <MarkdownContent content={content} />
            )}
          </div>
        </main>

        {/* Right Sidebar - TOC */}
        <aside className="hidden w-64 shrink-0 border-l xl:block">
          <div className="sticky top-20 p-4">
            <TableOfContents items={toc} />
          </div>
        </aside>
      </div>
    </>
  )
}

export default DocLayout
