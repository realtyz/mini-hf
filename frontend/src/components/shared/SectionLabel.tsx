import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface SectionLabelProps {
  children: ReactNode;
  className?: string;
}

/**
 * Eyebrow label used to title grouped sections inside cards and dialogs.
 * Quiet by design: small, uppercase, tracked — lets the content below carry
 * the weight.
 */
export function SectionLabel({ children, className }: SectionLabelProps) {
  return (
    <div
      className={cn(
        "text-xs font-medium text-muted-foreground uppercase tracking-wider",
        className,
      )}
    >
      {children}
    </div>
  );
}
