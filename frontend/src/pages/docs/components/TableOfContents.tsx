import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import type { TocItem } from './docs.types'

interface TableOfContentsProps {
  items: TocItem[]
  className?: string
}

export function TableOfContents({ items, className }: TableOfContentsProps) {
  const [activeId, setActiveId] = useState<string>('')

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id)
          }
        })
      },
      { rootMargin: '-20% 0% -80% 0%' }
    )

    items.forEach((item) => {
      const element = document.getElementById(item.id)
      if (element) {
        observer.observe(element)
      }
    })

    return () => observer.disconnect()
  }, [items])

  const handleClick = (id: string) => {
    const element = document.getElementById(id)
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  if (items.length === 0) {
    return null
  }

  return (
    <div className={cn('space-y-3', className)}>
      <p className="text-sm font-medium text-muted-foreground">本页目录</p>
      <nav className="border-l border-border">
        <ul className="space-y-1">
          {items.map((item) => (
            <li
              key={item.id}
              className={cn(
                'text-sm transition-colors',
                item.level === 3 && 'pl-4'
              )}
            >
              <button
                onClick={() => handleClick(item.id)}
                className={cn(
                  'block border-l-2 py-1 pr-2 text-left transition-colors hover:text-foreground',
                  activeId === item.id
                    ? 'border-primary font-medium text-foreground'
                    : 'border-transparent text-muted-foreground'
                )}
                style={{ paddingLeft: item.level === 3 ? '0.75rem' : '1rem' }}
              >
                {item.text}
              </button>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}

export default TableOfContents
