import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Box,
  Database,
  Smile,
  Globe,
  Search,
  X,
  History,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { TaskStatusBadge } from "@/components/tasks/TaskStatusBadge";
import { Pager } from "@/components/shared/Pager";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { TaskResponse } from "@/lib/api/types";
import { cn, formatDistanceToNow } from "@/lib/utils";

interface TaskHistoryTableProps {
  tasks: TaskResponse[]; // completed + failed
}

const PAGE_SIZE = 10;

function formatDuration(start: string, end: string | null): string {
  if (!end) return "-";
  const diff = Math.floor(
    (new Date(end).getTime() - new Date(start).getTime()) / 1000
  );
  if (diff < 60) return `${diff}秒`;
  if (diff < 3600) return `${Math.floor(diff / 60)}分${diff % 60}秒`;
  return `${Math.floor(diff / 3600)}时${Math.floor((diff % 3600) / 60)}分`;
}

export function TaskHistoryTable({ tasks }: TaskHistoryTableProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const [search, setSearch] = useState("");

  const filteredTasks = search
    ? tasks.filter((t) => t.repo_id.toLowerCase().includes(search.toLowerCase()))
    : tasks;

  const totalPages = Math.ceil(filteredTasks.length / PAGE_SIZE);
  const paginatedTasks = filteredTasks.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );

  const handleSearch = (value: string) => {
    setSearch(value);
    setCurrentPage(1);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="relative rounded-2xl border border-border/60 bg-card overflow-hidden"
    >
      {/* Subtle top accent line */}
      <div className="absolute top-0 left-4 right-4 h-px bg-linear-to-r from-transparent via-border/40 to-transparent" />

      {/* Search bar */}
      <div className="border-b border-border/30 px-5 py-3 bg-muted/20">
        <div className="relative max-w-sm">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground/50 pointer-events-none" />
          <Input
            type="search"
            placeholder="搜索仓库名称..."
            className="pl-9.5 pr-9 h-9 rounded-xl border-border/60 text-[13px] bg-background transition-all duration-200 focus:ring-2 focus:ring-primary/15"
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
          />
          {search && (
            <button
              type="button"
              className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground/40 hover:text-foreground transition-colors cursor-pointer"
              onClick={() => handleSearch("")}
              aria-label="清除搜索"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
      </div>

      <AnimatePresence mode="wait">
        {filteredTasks.length === 0 ? (
          <motion.div
            key="empty"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.3 }}
            className="py-12 text-center text-muted-foreground"
          >
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted/50">
              {tasks.length === 0 ? (
                <History className="h-6 w-6 text-muted-foreground/60" />
              ) : (
                <Search className="h-6 w-6 text-muted-foreground/60" />
              )}
            </div>
            <p className="text-sm font-medium text-foreground">
              {tasks.length === 0 ? "暂无已完成或失败的任务" : "未找到匹配的任务"}
            </p>
            <p className="text-xs mt-1">
              {tasks.length === 0 ? "任务完成后将显示在这里" : "尝试其他关键词"}
            </p>
          </motion.div>
        ) : (
          <motion.div
            key="table"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30 hover:bg-muted/30 border-b border-border/50">
                  <TableHead className="w-64 pl-5">
                    <span className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground select-none">
                      仓库
                    </span>
                  </TableHead>
                  <TableHead className="w-28 text-center">
                    <span className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground select-none">
                      来源
                    </span>
                  </TableHead>
                  <TableHead className="w-24 text-center">
                    <span className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground select-none">
                      类型
                    </span>
                  </TableHead>
                  <TableHead className="w-28 text-center">
                    <span className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground select-none">
                      版本
                    </span>
                  </TableHead>
                  <TableHead className="w-24 text-center">
                    <span className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground select-none">
                      状态
                    </span>
                  </TableHead>
                  <TableHead className="w-24 text-center">
                    <span className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground select-none">
                      耗时
                    </span>
                  </TableHead>
                  <TableHead className="w-36 pr-5 text-center">
                    <span className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground select-none">
                      完成时间
                    </span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedTasks.map((task, index) => (
                  <motion.tr
                    key={task.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.2, delay: index * 0.02 }}
                    className="hover:bg-muted/20 transition-all duration-150 group border-b border-border/30 last:border-0"
                  >
                    <TableCell className="py-3 pl-5">
                      <span
                        className="truncate max-w-60 block text-[13px] font-medium text-foreground/80 group-hover:text-primary transition-colors"
                        title={task.repo_id}
                      >
                        {task.repo_id}
                      </span>
                    </TableCell>
                    <TableCell className="py-3 text-center">
                      {task.source === "huggingface" ? (
                        <Badge variant="warning" className="text-[11px] font-medium rounded-lg px-2.5 py-0.5">
                          <Smile className="mr-1 h-3 w-3" />
                          HuggingFace
                        </Badge>
                      ) : (
                        <Badge variant="info" className="text-[11px] font-medium rounded-lg px-2.5 py-0.5">
                          <Globe className="mr-1 h-3 w-3" />
                          ModelScope
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="py-3 text-center">
                      <Badge
                        variant={task.repo_type === "model" ? "default" : "secondary"}
                        className={cn(
                          "text-[11px] font-medium rounded-lg px-2.5 py-0.5",
                          task.repo_type === "model"
                            ? "bg-slate-100 text-slate-600 border-slate-200/50 dark:bg-slate-800/50 dark:text-slate-300 dark:border-slate-700/50"
                            : "bg-amber-50 text-amber-700 border-amber-200/50 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-800/40",
                        )}
                      >
                        {task.repo_type === "model" ? (
                          <Box className="mr-1 h-2.5 w-2.5" />
                        ) : (
                          <Database className="mr-1 h-2.5 w-2.5" />
                        )}
                        {task.repo_type === "model" ? "模型" : "数据集"}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-3 text-center">
                      <span className="font-mono text-[12.5px] text-muted-foreground">{task.revision}</span>
                    </TableCell>
                    <TableCell className="py-3 text-center">
                      <TaskStatusBadge status={task.status} />
                    </TableCell>
                    <TableCell className="py-3 text-center text-[13px] text-muted-foreground tabular-nums">
                      {task.started_at && task.completed_at
                        ? formatDuration(task.started_at, task.completed_at)
                        : "-"}
                    </TableCell>
                    <TableCell className="py-3 pr-5 text-center text-[13px] text-muted-foreground/60">
                      {task.completed_at
                        ? formatDistanceToNow(new Date(task.completed_at))
                        : "-"}
                    </TableCell>
                  </motion.tr>
                ))}
              </TableBody>
            </Table>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer: Pagination + Stats */}
      {(totalPages > 1 || filteredTasks.length > 0) && (
        <div className="flex items-center justify-between border-t border-border/30 px-5 py-3 bg-muted/20">
          <p className="text-[13px] text-muted-foreground/60">
            共 <span className="font-mono font-medium tabular-nums text-foreground/80">{filteredTasks.length}</span> 个任务
            {search && tasks.length !== filteredTasks.length && (
              <span className="text-muted-foreground/40">（共 {tasks.length} 个）</span>
            )}
          </p>
          {totalPages > 1 && (
            <Pager
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
              className="mx-0 w-auto"
            />
          )}
        </div>
      )}
    </motion.div>
  );
}

export default TaskHistoryTable;
