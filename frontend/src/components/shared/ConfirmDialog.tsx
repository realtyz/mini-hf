import type { ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface ConfirmDialogProps {
  title: string;
  description: ReactNode;
  confirmLabel: string;
  confirmVariant?: "default" | "destructive" | "outline";
  onConfirm: () => void;
  children?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  disabled?: boolean;
}

export function ConfirmDialog({
  title,
  description,
  confirmLabel,
  confirmVariant = "default",
  onConfirm,
  children,
  open,
  onOpenChange,
  disabled,
}: ConfirmDialogProps) {
  const variantClass =
    confirmVariant === "destructive"
      ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
      : undefined;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      {children && <AlertDialogTrigger asChild>{children}</AlertDialogTrigger>}
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription className="pt-2">
            {description}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2">
          <AlertDialogCancel disabled={disabled}>返回</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={disabled}
            className={variantClass}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
