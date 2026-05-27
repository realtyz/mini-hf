import { Trash2, Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

interface CleanupConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  repoId: string | null;
  isDeleting: boolean;
  onConfirm: () => void;
}

export function CleanupConfirmDialog({
  open,
  onOpenChange,
  repoId,
  isDeleting,
  onConfirm,
}: CleanupConfirmDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="sm:max-w-106.25">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-left">确认删除仓库</AlertDialogTitle>
          <AlertDialogDescription className="text-left">
            您即将删除仓库{" "}
            <span className="font-semibold text-foreground">{repoId}</span>
            。此操作将删除所有缓存的文件、版本数据和数据库记录，所有数据将永久丢失！
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-row gap-3 sm:justify-end">
          <AlertDialogCancel
            disabled={isDeleting}
            className="flex-1 sm:flex-initial sm:min-w-25"
          >
            取消
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={isDeleting}
            className={cn(
              "flex-1 sm:flex-initial sm:min-w-25",
              "border border-red-300 bg-transparent text-red-600 hover:bg-red-50 hover:border-red-400 dark:border-red-800/60 dark:text-red-400 dark:hover:bg-red-950/50",
            )}
          >
            {isDeleting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                删除中...
              </>
            ) : (
              <>
                <Trash2 className="mr-2 h-4 w-4" />
                确认删除
              </>
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
