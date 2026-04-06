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
import { Button } from "@/components/ui/button";
import { TaskStatusBadge } from "@/components/tasks/TaskStatusBadge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import type { TaskResponse } from "@/lib/api-types";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";

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
      className="rounded-xl border bg-card shadow-sm overflow-hidden"
    >
      {/* Search bar */}
      <div className="border-b px-4 py-3 bg-muted/20">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="搜索仓库名称..."
            className="pl-9 pr-9 h-9 bg-background transition-colors focus-visible:ring-2"
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
          />
          {search && (
            <Button
              variant="ghost"
              size="sm"
              className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0 hover:bg-muted"
              onClick={() => handleSearch("")}
              aria-label="清除搜索"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
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
                <TableRow className="hover:bg-transparent bg-muted/30">
                  <TableHead className="w-64 font-semibold text-xs">仓库</TableHead>
                  <TableHead className="w-28 text-center font-semibold text-xs">来源</TableHead>
                  <TableHead className="w-24 text-center font-semibold text-xs">类型</TableHead>
                  <TableHead className="w-28 text-center font-semibold text-xs">版本</TableHead>
                  <TableHead className="w-24 text-center font-semibold text-xs">状态</TableHead>
                  <TableHead className="w-24 text-center font-semibold text-xs">耗时</TableHead>
                  <TableHead className="w-32 text-center font-semibold text-xs">完成时间</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedTasks.map((task, index) => (
                  <motion.tr
                    key={task.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.2, delay: index * 0.02 }}
                    className="h-12 hover:bg-muted/40 transition-colors duration-150 group border-b last:border-b-0"
                  >
                    <TableCell>
                      <span
                        className="truncate max-w-50 block group-hover:text-primary transition-colors"
                        title={task.repo_id}
                      >
                        {task.repo_id}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      {task.source === "huggingface" ? (
                        <Badge variant="warning" className="text-[10px] px-1.5 py-0 h-5">
                          <Smile className="mr-1 h-3 w-3" />
                          HuggingFace
                        </Badge>
                      ) : (
                        <Badge variant="info" className="text-[10px] px-1.5 py-0 h-5">
                          <Globe className="mr-1 h-3 w-3" />
                          ModelScope
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge
                        variant={task.repo_type === "model" ? "default" : "secondary"}
                        className="w-18 text-[10px] px-1.5 py-0 h-5 justify-center"
                      >
                        {task.repo_type === "model" ? (
                          <Box className="mr-0.5 h-2.5 w-2.5" />
                        ) : (
                          <Database className="mr-0.5 h-2.5 w-2.5" />
                        )}
                        {task.repo_type === "model" ? "模型" : "数据集"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <span className="font-mono text-xs">{task.revision}</span>
                    </TableCell>
                    <TableCell className="text-center">
                      <TaskStatusBadge status={task.status} />
                    </TableCell>
                    <TableCell className="text-center text-xs text-muted-foreground tabular-nums">
                      {task.started_at && task.completed_at
                        ? formatDuration(task.started_at, task.completed_at)
                        : "-"}
                    </TableCell>
                    <TableCell className="text-center text-xs text-muted-foreground tabular-nums">
                      {task.completed_at
                        ? format(new Date(task.completed_at), "MM-dd HH:mm", {
                            locale: zhCN,
                          })
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
        <div className="flex items-center justify-between border-t px-4 py-3 bg-muted/20">
          <p className="text-xs text-muted-foreground">
            共 <span className="font-medium text-foreground">{filteredTasks.length}</span> 个任务
            {search && tasks.length !== filteredTasks.length && (
              <span className="text-muted-foreground">（共 {tasks.length} 个）</span>
            )}
          </p>
          {totalPages > 1 && (
            <Pagination className="mx-0 w-auto">
              <PaginationContent className="gap-1">
                <PaginationItem>
                  <PaginationPrevious
                    onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                    className={`h-8 px-2 transition-colors ${
                      currentPage === 1
                        ? "pointer-events-none opacity-40"
                        : "cursor-pointer hover:bg-muted"
                    }`}
                  />
                </PaginationItem>

                {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                  <PaginationItem key={page}>
                    <PaginationLink
                      onClick={() => setCurrentPage(page)}
                      isActive={currentPage === page}
                      className="h-8 w-8 cursor-pointer text-xs"
                    >
                      {page}
                    </PaginationLink>
                  </PaginationItem>
                ))}

                <PaginationItem>
                  <PaginationNext
                    onClick={() =>
                      setCurrentPage(Math.min(totalPages, currentPage + 1))
                    }
                    className={`h-8 px-2 transition-colors ${
                      currentPage === totalPages
                        ? "pointer-events-none opacity-40"
                        : "cursor-pointer hover:bg-muted"
                    }`}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          )}
        </div>
      )}
    </motion.div>
  );
}

export default TaskHistoryTable;
