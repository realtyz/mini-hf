import { Progress } from "@/components/ui/progress";
import { formatBytes, formatDuration } from "@/lib/utils";

interface TaskProgressBarProps {
  progressPercent: number;
  downloadedBytes: number;
  totalBytes: number;
  speedBytesPerSec?: number | null;
  etaSeconds?: number | null;
  showDetails?: boolean;
  className?: string;
}

export function TaskProgressBar({
  progressPercent,
  downloadedBytes,
  totalBytes,
  speedBytesPerSec,
  etaSeconds,
  showDetails = true,
  className,
}: TaskProgressBarProps) {
  return (
    <div className={`space-y-1 ${className || ""}`}>
      <Progress value={progressPercent} className="h-2" />
      {showDetails && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{progressPercent.toFixed(1)}%</span>
          <span>
            {formatBytes(downloadedBytes)} / {formatBytes(totalBytes)}
          </span>
        </div>
      )}
      {showDetails && speedBytesPerSec !== undefined && (
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          {speedBytesPerSec !== null && speedBytesPerSec > 0 && (
            <span>速度: {formatBytes(speedBytesPerSec)}/s</span>
          )}
          {etaSeconds !== undefined && etaSeconds !== null && etaSeconds > 0 && (
            <span>预计剩余: {formatDuration(etaSeconds)}</span>
          )}
        </div>
      )}
    </div>
  );
}

export default TaskProgressBar;
