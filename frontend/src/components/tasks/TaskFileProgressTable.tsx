import { FileCheck, FileX, Loader2, Clock } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { FileProgressItem } from "@/lib/api-types";
import { formatBytes } from "@/lib/utils";

interface TaskFileProgressTableProps {
  files: FileProgressItem[];
  className?: string;
}

const statusIcons = {
  pending: <Clock className="h-4 w-4 text-muted-foreground" />,
  downloading: <Loader2 className="h-4 w-4 animate-spin text-primary" />,
  uploading: <Loader2 className="h-4 w-4 animate-spin text-primary" />,
  completed: <FileCheck className="h-4 w-4 text-green-500" />,
  failed: <FileX className="h-4 w-4 text-destructive" />,
};

const statusLabels = {
  pending: "等待中",
  downloading: "下载中",
  uploading: "上传中",
  completed: "完成",
  failed: "失败",
};

export function TaskFileProgressTable({
  files,
  className,
}: TaskFileProgressTableProps) {
  if (!files || files.length === 0) {
    return (
      <div className={`text-center text-sm text-muted-foreground py-4 ${className || ""}`}>
        暂无文件信息
      </div>
    );
  }

  return (
    <div className={`border rounded-md ${className || ""}`}>
      <ScrollArea className="h-75">
        <div className="min-w-full">
          <div className="sticky top-0 bg-muted/50 border-b text-xs font-medium grid grid-cols-[1fr_80px_100px_80px] gap-2 px-4 py-2">
            <span>文件路径</span>
            <span className="text-center">状态</span>
            <span className="text-right">进度</span>
            <span className="text-right">大小</span>
          </div>
          <div className="divide-y">
            {files.map((file, index) => (
              <div
                key={`${file.path}-${index}`}
                className="grid grid-cols-[1fr_80px_100px_80px] gap-2 px-4 py-2 items-center text-sm hover:bg-muted/50"
              >
                <span
                  className="truncate font-mono text-xs"
                  title={file.path}
                >
                  {file.path}
                </span>
                <div className="flex items-center justify-center gap-1">
                  {statusIcons[file.status]}
                  <span className="text-xs">{statusLabels[file.status]}</span>
                </div>
                <div className="text-right">
                  {file.status === "downloading" || file.status === "uploading" ? (
                    <div className="space-y-0.5">
                      <Progress
                        value={file.progress_percent}
                        className="h-1.5"
                      />
                      <span className="text-xs text-muted-foreground">
                        {file.progress_percent.toFixed(0)}%
                      </span>
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      {file.status === "completed" ? "100%" : "-"}
                    </span>
                  )}
                </div>
                <span className="text-right text-xs text-muted-foreground">
                  {formatBytes(file.total_bytes)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}

export default TaskFileProgressTable;
