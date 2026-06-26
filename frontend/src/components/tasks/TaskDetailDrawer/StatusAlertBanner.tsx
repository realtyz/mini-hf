import { Clock } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { TaskStatus } from "@/lib/api/types";

export function StatusAlertBanner({ status }: { status: TaskStatus }) {
  if (status === "canceling") {
    return (
      <Alert className="border-orange-200/60 bg-orange-50/60 dark:bg-orange-950/20 dark:border-orange-800/40 rounded-xl py-3">
        <Clock className="h-4 w-4 text-orange-500 dark:text-orange-400 animate-pulse" />
        <AlertDescription className="ml-2 text-orange-800 dark:text-orange-200 font-medium text-[13px]">
          正在取消任务，请稍候...
        </AlertDescription>
      </Alert>
    );
  }
  if (status === "pausing") {
    return (
      <Alert className="border-yellow-200/60 bg-yellow-50/60 dark:bg-yellow-950/20 dark:border-yellow-800/40 rounded-xl py-3">
        <Clock className="h-4 w-4 text-yellow-500 dark:text-yellow-400 animate-pulse" />
        <AlertDescription className="ml-2 text-yellow-800 dark:text-yellow-200 font-medium text-[13px]">
          正在暂停任务，请稍候...
        </AlertDescription>
      </Alert>
    );
  }
  return null;
}
