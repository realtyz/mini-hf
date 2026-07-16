import { ShieldCheck, AlertTriangle, XCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { STRINGS } from "@/lib/constants/strings";
import type { BatchDeleteRepoItem } from "@/lib/api/types";

interface BatchDeleteResultDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  results: BatchDeleteRepoItem[];
  totalRequested: number;
}

/**
 * Map backend error strings (English, from repo_service exceptions) to
 * localized Chinese messages so users can understand the failure reason.
 * Unknown errors are returned as-is to preserve diagnostic info.
 */
function localizeError(error: string | null | undefined): string {
  if (!error) return "未知错误";
  if (error.includes("not found")) return "仓库不存在";
  if (error.includes("being updated"))
    return "仓库正在更新中，请等待更新完成";
  if (error.includes("active download tasks"))
    return "存在进行中的下载任务，请等待完成";
  return error;
}

function FailedItem({ item }: { item: BatchDeleteRepoItem }) {
  return (
    <div className="flex items-start gap-3 rounded-md border border-red-200 bg-red-50/50 px-3 py-2.5 dark:border-red-800/40 dark:bg-red-950/20">
      <XCircle className="mt-0.5 size-4 shrink-0 text-red-500" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate">{item.repo_id}</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {localizeError(item.error)}
        </p>
      </div>
    </div>
  );
}

export function BatchDeleteResultDialog({
  open,
  onOpenChange,
  results,
  totalRequested,
}: BatchDeleteResultDialogProps) {
  const succeeded = results.filter((r) => r.deleted);
  const failed = results.filter((r) => !r.deleted);
  const allSucceeded = failed.length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {allSucceeded ? (
              <>
                <ShieldCheck className="size-5 text-emerald-500" />
                {STRINGS.batchDeleteAllSuccess}
              </>
            ) : (
              <>
                <AlertTriangle className="size-5 text-amber-500" />
                {STRINGS.batchDeleteResultTitle}
              </>
            )}
          </DialogTitle>
          <DialogDescription>
            {STRINGS.batchDeleteResultSummary(
              totalRequested,
              succeeded.length,
              failed.length,
            )}
          </DialogDescription>
        </DialogHeader>

        {!allSucceeded && (
          <ScrollArea className="max-h-64">
            <div className="space-y-2 pr-1">
              {failed.map((item) => (
                <FailedItem key={item.repo_id} item={item} />
              ))}
            </div>
          </ScrollArea>
        )}

        <DialogFooter showCloseButton>
          <Button
            variant={allSucceeded ? "default" : "outline"}
            onClick={() => onOpenChange(false)}
            className={cn(
              allSucceeded && "bg-emerald-600 hover:bg-emerald-700",
            )}
          >
            {STRINGS.batchDeleteResultClose}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
