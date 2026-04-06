import { Link, useLocation } from 'react-router'
import { BookOpen, FileText } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { DocMeta } from './docs.types'

interface DocSidebarProps {
  docs: DocMeta[]
  className?: string
}

export function DocSidebar({ docs, className }: DocSidebarProps) {
  const location = useLocation()
  const currentSlug = location.pathname.split('/').pop() || 'index'

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex items-center gap-2 px-2 py-1">
        <BookOpen className="size-5 text-primary" />
        <span className="font-semibold">文档</span>
      </div>

      <nav className="space-y-1">
        {docs.map((doc) => {
          const isActive = currentSlug === doc.slug

          return (
            <Link
              key={doc.slug}
              to={`/docs/${doc.slug}`}
              className={cn(
                'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors',
                isActive
                  ? 'bg-primary/10 font-medium text-primary'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              <FileText
                className={cn(
                  'size-4',
                  isActive ? 'text-primary' : 'text-muted-foreground'
                )}
              />
              <span>{doc.title}</span>
            </Link>
          )
        })}
      </nav>
    </div>
  )
}

export default DocSidebar
