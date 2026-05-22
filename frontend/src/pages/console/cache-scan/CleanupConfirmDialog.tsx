import { Trash2, Loader2, AlertTriangle } from "lucide-react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

interface CleanupConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  repoId: string | null;
  isDeleting: boolean;
  hardDelete: boolean;
  onHardDeleteChange: (checked: boolean) => void;
  onConfirm: () => void;
}

export function CleanupConfirmDialog({
  open,
  onOpenChange,
  repoId,
  isDeleting,
  hardDelete,
  onHardDeleteChange,
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
            。{!hardDelete && "此操作将删除所有缓存的文件和版本数据。"}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="py-4">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="hard-delete"
              checked={hardDelete}
              onCheckedChange={(checked) => onHardDeleteChange(checked === true)}
            />
            <Label
              htmlFor="hard-delete"
              className="flex-1 cursor-pointer peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">彻底删除</span>
                <span className="text-xs text-muted-foreground">
                  (同时删除数据库记录)
                </span>
              </div>
            </Label>
          </div>
          {hardDelete && (
            <div className="mt-3 ml-6 space-y-1">
              <div className="flex items-start gap-2 text-xs text-destructive">
                <AlertTriangle className="size-3 shrink-0 mt-0.5" />
                <span>此操作将从数据库完全移除仓库记录，所有数据将永久丢失！</span>
              </div>
              <ul className="ml-5 text-xs text-muted-foreground space-y-1 list-disc">
                <li>从数据库完全移除仓库记录</li>
                <li>从数据库删除所有文件树记录</li>
                <li>从数据库删除所有版本快照</li>
              </ul>
            </div>
          )}
        </div>
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
              hardDelete
                ? ""
                : "border border-red-300 bg-transparent text-red-600 hover:bg-red-50 hover:border-red-400 dark:border-red-800/60 dark:text-red-400 dark:hover:bg-red-950/50",
            )}
          >
            {isDeleting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {hardDelete ? "彻底删除中..." : "删除中..."}
              </>
            ) : (
              <>
                <Trash2 className="mr-2 h-4 w-4" />
                {hardDelete ? "确认彻底删除" : "确认删除"}
              </>
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
