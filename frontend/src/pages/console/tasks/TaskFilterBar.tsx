import { Search, X, Filter } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { motion, AnimatePresence } from "framer-motion";
import { itemVariants } from "@/lib/animations/motion-config";
import { cn } from "@/lib/utils";
import { STRINGS } from "@/lib/constants/strings";
import type { TaskStatus } from "@/lib/api/types";

const STATUS_OPTIONS: {
  value: TaskStatus | "all";
  label: string;
  color?: string;
}[] = [
  { value: "all", label: STRINGS.statusAll },
  {
    value: "pending_approval",
    label: STRINGS.statusPendingApproval,
    color: "text-amber-500",
  },
  { value: "pending", label: STRINGS.statusQueued, color: "text-slate-500" },
  { value: "running", label: STRINGS.statusRunning, color: "text-blue-500" },
  { value: "pausing", label: STRINGS.statusPausing, color: "text-orange-500" },
  { value: "paused", label: STRINGS.statusPaused, color: "text-yellow-500" },
  {
    value: "completed",
    label: STRINGS.statusCompleted,
    color: "text-emerald-500",
  },
  { value: "failed", label: STRINGS.statusFailed, color: "text-red-500" },
  {
    value: "cancelled",
    label: STRINGS.statusCancelled,
    color: "text-gray-500",
  },
];

interface TaskFilterBarProps {
  status: TaskStatus | "all";
  onStatusChange: (value: TaskStatus | "all") => void;
  search: string;
  onSearchChange: (value: string) => void;
  total: number;
  isLoading: boolean;
  error: unknown;
}

export function TaskFilterBar({
  status,
  onStatusChange,
  search,
  onSearchChange,
  total,
  isLoading,
  error,
}: TaskFilterBarProps) {
  return (
    <motion.div
      className="relative rounded-2xl border border-border/60 bg-card overflow-hidden"
      variants={itemVariants}
      whileHover={{
        boxShadow: "0 4px 24px -6px rgba(0, 0, 0, 0.06)",
      }}
      transition={{ duration: 0.25 }}
    >
      {/* Subtle top accent line */}
      <div className="absolute top-0 left-4 right-4 h-px bg-linear-to-r from-transparent via-border/40 to-transparent" />

      <div className="flex flex-wrap items-center gap-3 px-5 py-4">
        <motion.div whileHover={{ scale: 1.01 }}>
          <Select
            value={status}
            onValueChange={(v) => onStatusChange(v as TaskStatus | "all")}
          >
            <SelectTrigger className="w-36 h-9 rounded-xl border-border/60 text-[13px]">
              <div className="flex items-center gap-2">
                <Filter className="size-3.5 text-muted-foreground/60" />
                <SelectValue placeholder="状态筛选" />
              </div>
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  <span className="flex items-center gap-2">
                    {option.color && option.value !== "all" && (
                      <span
                        className={cn(
                          "size-2 rounded-full",
                          option.color.replace("text-", "bg-"),
                        )}
                      />
                    )}
                    {option.label}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </motion.div>

        <div className="relative flex-1 min-w-50 max-w-sm">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground/50 pointer-events-none" />
          <Input
            type="search"
            placeholder="搜索仓库名称..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9.5 h-9 rounded-xl border-border/60 text-[13px] transition-all duration-200 focus:ring-2 focus:ring-primary/15"
          />
          {search && (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground/40 hover:text-foreground transition-colors cursor-pointer"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>

        <AnimatePresence mode="wait">
          {!isLoading && !error && (
            <motion.div
              key="count"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.15 }}
              className="ml-auto flex items-center gap-1.5 text-[13px] text-muted-foreground/60"
            >
              <span className="font-mono font-medium tabular-nums text-foreground/80">
                {total.toLocaleString()}
              </span>
              个任务
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
