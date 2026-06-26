interface SectionHeaderProps {
  children: React.ReactNode;
  accent?: string;
  badge?: React.ReactNode;
}

export function SectionHeader({
  children,
  accent = "bg-primary",
  badge,
}: SectionHeaderProps) {
  return (
    <div className="flex items-center gap-2.5 mb-3">
      <span className={`w-0.75 h-4 ${accent} rounded-full shrink-0`} />
      <h4 className="text-[13px] font-semibold text-foreground tracking-tight">
        {children}
      </h4>
      {badge && <span className="ml-auto">{badge}</span>}
    </div>
  );
}
