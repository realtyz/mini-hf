interface TimelineItemProps {
  label: string;
  value: string;
  isLast?: boolean;
}

export function TimelineItem({ label, value, isLast = false }: TimelineItemProps) {
  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 transition-colors duration-200 ${isLast ? "bg-foreground/40" : "bg-border"}`} />
        {!isLast && <div className="w-px flex-1 bg-border/50 mt-1" />}
      </div>
      <div className={isLast ? "" : "pb-3"}>
        <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider block">
          {label}
        </span>
        <span className="text-[13px] text-foreground">{value}</span>
      </div>
    </div>
  );
}
