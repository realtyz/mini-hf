import type { ReactNode, ComponentType, SVGProps } from 'react'

interface PageHeaderProps {
  icon: ComponentType<SVGProps<SVGSVGElement>>
  title: string
  subtitle: string
  actions?: ReactNode
}

export function PageHeader({ icon: Icon, title, subtitle, actions }: PageHeaderProps) {
  return (
    <div className="mb-6 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="size-10 rounded-xl bg-primary/5 border border-primary/10 flex items-center justify-center">
          <Icon className="size-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          <p className="text-[13px] text-muted-foreground mt-0.5">{subtitle}</p>
        </div>
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}
