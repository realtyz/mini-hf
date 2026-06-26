interface InfoRowProps {
  icon?: React.ReactNode;
  label: string;
  children: React.ReactNode;
}

export function InfoRow({ icon, label, children }: InfoRowProps) {
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-border/40 last:border-0">
      {icon && (
        <span className="mt-0.5 shrink-0 text-muted-foreground/60">{icon}</span>
      )}
      <span className="text-[13px] text-muted-foreground font-medium w-20 shrink-0 leading-5">
        {label}
      </span>
      <div className="flex-1 text-[13px] text-foreground leading-5 min-w-0">
        {children}
      </div>
    </div>
  );
}
