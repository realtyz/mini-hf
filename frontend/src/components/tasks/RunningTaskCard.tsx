import { useState } from "react";
import {
  Box,
  Database,
  Smile,
  Globe,
  ChevronDown,
  FileDown,
  Clock,
} from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { FileProgressList } from "./FileProgressList";
import type { TaskResponse } from "@/lib/api-types";
import { useTaskProgress } from "@/hooks/api/use-task-progress";

interface RunningTaskCardProps {
  task: TaskResponse;
}

function formatDuration(startedAt: string | null): string {
  if (!startedAt) return "-";
  const start = new Date(startedAt);
  const now = new Date();
  const diff = Math.floor((now.getTime() - start.getTime()) / 1000);

  if (diff < 60) return `${diff}秒`;
  if (diff < 3600) return `${Math.floor(diff / 60)}分${diff % 60}秒`;
  return `${Math.floor(diff / 3600)}时${Math.floor((diff % 3600) / 60)}分`;
}

export function RunningTaskCard({ task }: RunningTaskCardProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const { data: progressData } = useTaskProgress(
    task.id,
    task.status
  );

  const progress =
    task.total_file_count > 0
      ? Math.round(
          ((task.total_file_count - task.required_file_count) /
            task.total_file_count) *
            100
        )
      : 0;

  const completedFiles = task.total_file_count - task.required_file_count;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            {/* 仓库信息 */}
            <div className="flex items-center gap-2 mb-2">
              {task.source === "huggingface" ? (
                <Smile className="h-4 w-4 text-orange-500 shrink-0" />
              ) : (
                <Globe className="h-4 w-4 text-blue-500 shrink-0" />
              )}
              <span
                className="font-medium truncate"
                title={task.repo_id}
              >
                {task.repo_id}
              </span>
              <Badge variant={task.repo_type === "model" ? "default" : "secondary"} className="shrink-0">
                {task.repo_type === "model" ? (
                  <Box className="mr-1 h-3 w-3" />
                ) : (
                  <Database className="mr-1 h-3 w-3" />
                )}
                {task.repo_type === "model" ? "模型" : "数据集"}
              </Badge>
            </div>

            {/* 版本和时间信息 */}
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span>版本: {task.revision}</span>
              <span className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                已运行 {formatDuration(task.started_at)}
              </span>
            </div>
          </div>

          {/* 右侧进度 */}
          <div className="shrink-0 text-right ml-4">
            <div className="text-2xl font-bold text-blue-600">{progress}%</div>
            <div className="text-xs text-muted-foreground">
              {completedFiles} / {task.total_file_count} 文件
            </div>
          </div>
        </div>

        {/* 整体进度条 */}
        <Progress value={progress} className="h-2 mt-3" />
      </CardHeader>

      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="w-full rounded-none border-t py-2 h-auto hover:bg-muted/50"
          >
            <div className="flex items-center gap-2 text-muted-foreground">
              <FileDown className="h-4 w-4" />
              <span className="text-sm">文件下载详情</span>
              <ChevronDown
                className={`h-4 w-4 transition-transform ${
                  isExpanded ? "" : "-rotate-180"
                }`}
              />
            </div>
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-4 pb-4 bg-muted/30">
            <FileProgressList
              taskId={task.id}
              files={progressData?.files ?? []}
              isRunning={task.status === "running"}
              currentFile={progressData?.current_file}
            />
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

export default RunningTaskCard;
