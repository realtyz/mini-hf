import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";

interface FieldProps {
  id: string;
  label: string;
  /** Supporting copy shown beneath the control. */
  hint?: string;
  children: ReactNode;
}

/**
 * Form field wrapper: ties a label, control, and optional hint together with
 * consistent spacing. Used by the CreateTaskDialog form step.
 */
export function Field({ id, label, hint, children }: FieldProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground/70">{hint}</p>}
    </div>
  );
}
