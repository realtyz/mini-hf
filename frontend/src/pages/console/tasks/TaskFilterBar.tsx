import { Search, Filter } from "lucide-react";
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
  { value: "pending_approval", label: STRINGS.statusPendingApproval, color: "text-amber-500" },
  { value: "pending", label: STRINGS.statusQueued, color: "text-slate-500" },
  { value: "running", label: STRINGS.statusRunning, color: "text-blue-500" },
  { value: "pausing", label: STRINGS.statusPausing, color: "text-orange-500" },
  { value: "paused", label: STRINGS.statusPaused, color: "text-yellow-500" },
  { value: "completed", label: STRINGS.statusCompleted, color: "text-emerald-500" },
  { value: "failed", label: STRINGS.statusFailed, color: "text-red-500" },
  { value: "cancelled", label: STRINGS.statusCancelled, color: "text-gray-500" },
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
      className="rounded-xl border bg-card p-4 mb-6"
      variants={itemVariants}
      whileHover={{ boxShadow: "0 4px 20px -4px rgba(0, 0, 0, 0.08)" }}
      transition={{ duration: 0.2 }}
    >
      <div className="flex flex-wrap items-center gap-3">
        <motion.div whileHover={{ scale: 1.01 }} className="relative">
          <Select
            value={status}
            onValueChange={(v) => onStatusChange(v as TaskStatus | "all")}
          >
            <SelectTrigger className="w-36 h-9">
              <div className="flex items-center gap-2">
                <Filter className="size-3.5 text-muted-foreground" />
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
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="搜索仓库名称..."
            className="pl-9 h-9 transition-all duration-200 focus:ring-2 focus:ring-primary/20"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>

        <AnimatePresence mode="wait">
          {!isLoading && !error && (
            <motion.div
              key="count"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              className="ml-auto text-sm text-muted-foreground"
            >
              共 <span className="font-medium text-foreground">{total}</span>{" "}
              个任务
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
