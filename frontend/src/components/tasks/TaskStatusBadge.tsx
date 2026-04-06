import { Badge } from "@/components/ui/badge";
import type { TaskStatus } from "@/lib/api-types";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

interface TaskStatusBadgeProps {
  status: TaskStatus;
  className?: string;
  showDot?: boolean;
  size?: "sm" | "md";
}

const statusConfig: Record<
  TaskStatus,
  {
    label: string;
    variant: "warning" | "info" | "success" | "danger" | "neutral";
    dotColor: string;
    isActive: boolean;
  }
> = {
  pending_approval: {
    label: "待审批",
    variant: "warning",
    dotColor: "bg-amber-500",
    isActive: true,
  },
  pending: {
    label: "排队中",
    variant: "info",
    dotColor: "bg-sky-500",
    isActive: true,
  },
  running: {
    label: "进行中",
    variant: "info",
    dotColor: "bg-sky-500",
    isActive: true,
  },
  canceling: {
    label: "取消中",
    variant: "warning",
    dotColor: "bg-amber-500",
    isActive: true,
  },
  cancelled: {
    label: "已取消",
    variant: "neutral",
    dotColor: "bg-slate-400",
    isActive: false,
  },
  completed: {
    label: "已完成",
    variant: "success",
    dotColor: "bg-emerald-500",
    isActive: false,
  },
  failed: {
    label: "失败",
    variant: "danger",
    dotColor: "bg-red-500",
    isActive: false,
  },
};

// Status dot component with unified animation style
function StatusDot({ color, isActive }: { color: string; isActive: boolean }) {
  if (!isActive) {
    return <span className={cn("size-1.5 rounded-full", color)} />;
  }

  return (
    <span className="relative flex size-2">
      <motion.span
        className={cn("absolute inline-flex h-full w-full rounded-full opacity-75", color)}
        animate={{
          scale: [1, 2, 1],
          opacity: [0.6, 0, 0.6],
        }}
        transition={{
          duration: 1.5,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />
      <motion.span
        className={cn("relative inline-flex size-2 rounded-full", color)}
        animate={{ opacity: [1, 0.7, 1] }}
        transition={{
          duration: 1.5,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />
    </span>
  );
}

export function TaskStatusBadge({
  status,
  className,
  showDot = true,
  size = "sm",
}: TaskStatusBadgeProps) {
  const config = statusConfig[status];

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      whileHover={{ scale: 1.02 }}
    >
      <Badge
        variant={config.variant}
        className={cn(
          "min-w-16 justify-center gap-1.5 font-medium transition-shadow duration-200",
          size === "sm" ? "text-[11px] px-2 py-0.5" : "text-xs px-2.5 py-1",
          className
        )}
      >
        <AnimatePresence mode="wait">
          {showDot && (
            <motion.span
              key={`dot-${status}`}
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0 }}
              transition={{ duration: 0.15 }}
            >
              <StatusDot color={config.dotColor} isActive={config.isActive} />
            </motion.span>
          )}
        </AnimatePresence>

        <span className="truncate">{config.label}</span>
      </Badge>
    </motion.div>
  );
}

export default TaskStatusBadge;
