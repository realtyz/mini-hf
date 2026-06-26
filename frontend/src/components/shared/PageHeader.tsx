import type { ReactNode, ComponentType, SVGProps } from "react";

interface PageHeaderProps {
  /** Lucide icon component */
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  /** Page title */
  title: string;
  /** Subtitle / description shown below the title */
  subtitle: string;
  /** Action buttons rendered to the right of the header */
  actions?: ReactNode;
  /** Optional content injected between the header row and actions.
   *  Useful for inline controls like preset pickers that belong with the header. */
  children?: ReactNode;
}

export function PageHeader({
  icon: Icon,
  title,
  subtitle,
  actions,
  children,
}: PageHeaderProps) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-4">
        <div className="relative">
          <div className="size-11 rounded-2xl bg-linear-to-br from-slate-100 to-slate-50 dark:from-slate-800/80 dark:to-slate-900/80 border border-slate-200/60 dark:border-slate-700/50 flex items-center justify-center shadow-sm">
            <Icon className="size-5 text-slate-600 dark:text-slate-300" />
          </div>
          {/* Subtle outer ring */}
          <div className="absolute -inset-0.5 rounded-2xl border border-slate-200/30 dark:border-slate-600/20 -z-10" />
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">
            {title}
          </h1>
          <p className="text-[13px] text-muted-foreground/60 mt-0.5 leading-relaxed">
            {subtitle}
          </p>
        </div>
        {children}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
