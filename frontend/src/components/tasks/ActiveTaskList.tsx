import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Smile, Globe, Loader2, Clock, Pin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { TaskResponse, TaskStatus } from "@/lib/api/types";
import { TASK_STATUS_CONFIG } from "@/lib/config/task-status";
import { useElapsedTimer } from "@/hooks/use-elapsed-timer";
import { formatElapsed } from "@/lib/utils";

interface ActiveTaskListProps {
  tasks: TaskResponse[];
  selectedTaskId: number | null;
  onSelectTask: (taskId: number) => void;
}

const ACTIVE_STATUS_COLORS: Partial<Record<TaskStatus, string>> = {
  running:
    "text-blue-600 bg-blue-50 border-blue-200 dark:bg-blue-950/50 dark:text-blue-400 dark:border-blue-800",
  pending_approval:
    "text-amber-600 bg-amber-50 border-amber-200 dark:bg-amber-950/50 dark:text-amber-400 dark:border-amber-800",
  pending:
    "text-slate-600 bg-slate-50 border-slate-200 dark:bg-slate-800/50 dark:text-slate-400 dark:border-slate-700",
};

const DEFAULT_STATUS_COLOR =
  "text-slate-600 bg-slate-50 border-slate-200 dark:bg-slate-800/50 dark:text-slate-400 dark:border-slate-700";

// Static (non-ticking) elapsed ms for a started-at timestamp, evaluated at call time.
function elapsedSince(startedAtMs: number): number {
  return Date.now() - startedAtMs;
}

interface TaskListItemProps {
  task: TaskResponse;
  isSelected: boolean;
  onClick: () => void;
  index: number;
}

function TaskListItem({ task, isSelected, onClick, index }: TaskListItemProps) {
  const isRunning = task.status?.toLowerCase() === "running";
  const startedAtMs = task.started_at
    ? new Date(task.started_at).getTime()
    : null;
  const elapsedMs = useElapsedTimer(isRunning, startedAtMs);
  // Running tasks tick via the hook once it has a value; until then (and for
  // non-running tasks) fall back to a static snapshot, matching prior behavior.
  const elapsed = formatElapsed(
    startedAtMs === null
      ? null
      : elapsedMs > 0
        ? elapsedMs
        : elapsedSince(startedAtMs),
  );
  const [isPressed, setIsPressed] = useState(false);
  const itemRef = useRef<HTMLDivElement>(null);

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onClick();
    }
  };

  return (
    <motion.div
      ref={itemRef}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="button"
      aria-pressed={isSelected}
      onMouseDown={() => setIsPressed(true)}
      onMouseUp={() => setIsPressed(false)}
      onMouseLeave={() => setIsPressed(false)}
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{
        duration: 0.25,
        delay: index * 0.04,
        ease: [0.16, 1, 0.3, 1],
      }}
      className={`
        group relative px-3 py-2 cursor-pointer transition-all duration-200 border-b last:border-b-0
        hover:bg-muted/40
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset
        ${isPressed ? "scale-[0.99] bg-muted/60" : ""}
        ${
          isSelected
            ? "bg-blue-50/70 border-l-[3px] border-l-blue-500 dark:bg-blue-950/30"
            : "border-l-[3px] border-l-transparent hover:border-l-muted-foreground/30"
        }
      `}
    >
      <div className="flex items-center gap-2.5">
        {/* Status indicator */}
        <div className="shrink-0">
          {task.status?.toLowerCase() === "running" ? (
            <div className="flex h-4 w-4 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/50">
              <Loader2 className="h-2.5 w-2.5 text-blue-500 animate-spin" />
            </div>
          ) : task.pinned_at ? (
            <div className="flex h-4 w-4 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/50">
              <Pin className="h-2.5 w-2.5 text-amber-500" />
            </div>
          ) : (
            <div
              className={`flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-semibold ${ACTIVE_STATUS_COLORS[task.status] ?? DEFAULT_STATUS_COLOR}`}
            >
              {index + 1}
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Repo info - single line */}
          <div className="flex items-center gap-1.5">
            {task.source === "huggingface" ? (
              <Smile className="h-3 w-3 text-orange-500 shrink-0" />
            ) : (
              <Globe className="h-3 w-3 text-blue-500 shrink-0" />
            )}
            <span
              className="font-medium text-xs truncate group-hover:text-primary transition-colors"
              title={task.repo_id}
            >
              {task.repo_id}
            </span>
            <Badge
              variant={task.repo_type === "model" ? "default" : "secondary"}
              className="text-[9px] px-1 py-0 h-3.5 ml-1"
            >
              {task.repo_type === "model" ? "模型" : "数据集"}
            </Badge>
          </div>

          {/* Status and elapsed - second line */}
          <div className="flex items-center gap-2 mt-0.5">
            <div className="flex items-center gap-1">
              <span
                className={`inline-block w-1.5 h-1.5 rounded-full ${TASK_STATUS_CONFIG[task.status]?.dotClass ?? "bg-slate-400"}`}
              />
              <span className="text-[10px] font-medium text-muted-foreground">
                {TASK_STATUS_CONFIG[task.status]?.label ?? task.status}
              </span>
            </div>
            <span
              className="text-[10px] text-muted-foreground truncate max-w-16 font-mono"
              title={task.revision}
            >
              {task.revision}
            </span>
            {isRunning && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex items-center gap-0.5 rounded bg-blue-50 px-1 py-0 text-[10px] text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
              >
                <Clock className="h-2.5 w-2.5" />
                <span className="tabular-nums">{elapsed}</span>
              </motion.div>
            )}
          </div>
        </div>

        {/* Selection indicator */}
        <AnimatePresence>
          {isSelected && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.15 }}
              className="shrink-0"
            >
              <div className="h-1.5 w-1.5 rounded-full bg-blue-500" />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

export function ActiveTaskList({
  tasks,
  selectedTaskId,
  onSelectTask,
}: ActiveTaskListProps) {
  if (tasks.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
        className="rounded-xl border-2 border-dashed bg-muted/20 py-12 text-center"
      >
        <div className="text-muted-foreground">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-muted/50">
            <Clock className="h-5 w-5 text-muted-foreground/60" />
          </div>
          <p className="text-sm font-medium text-foreground">
            暂无进行中的任务
          </p>
          <p className="text-xs mt-1">新任务将自动显示在这里</p>
        </div>
      </motion.div>
    );
  }

  return (
    <div className="rounded-xl border overflow-hidden bg-card shadow-sm h-full">
      <div className="h-full overflow-y-auto scrollbar-gutter-stable">
        {tasks.map((task, index) => (
          <TaskListItem
            key={task.id}
            task={task}
            index={index}
            isSelected={selectedTaskId === task.id}
            onClick={() => onSelectTask(task.id)}
          />
        ))}
      </div>
    </div>
  );
}