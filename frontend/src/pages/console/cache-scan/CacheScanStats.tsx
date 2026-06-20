import { motion } from "framer-motion";
import { itemVariants } from "@/lib/animations/motion-config";
import { Clock, Database, HardDrive, HelpCircle } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { cn, formatBytes } from "@/lib/utils";

interface CacheScanStatsProps {
  scannedAt: string;
  totalColdRepos: number;
  totalOrphanRepos: number;
  totalUntrackedRepos: number;
  totalWastedBytes: number;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  return `${days} 天前`;
}

export function CacheScanStats({
  scannedAt,
  totalColdRepos,
  totalOrphanRepos,
  totalUntrackedRepos,
  totalWastedBytes,
}: CacheScanStatsProps) {
  const totalRepos = totalColdRepos + totalOrphanRepos + totalUntrackedRepos;

  return (
    <motion.div variants={itemVariants} className="flex items-stretch gap-6">
      <div className="flex items-center gap-3">
        <div className="size-10 rounded-xl bg-blue-500/10 border border-blue-500/15 flex items-center justify-center">
          <Clock className="size-5 text-blue-600 dark:text-blue-400" />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
            扫描完成时间
          </p>
          <p className="text-lg font-bold tracking-tight tabular-nums">
            {formatDate(scannedAt)}
          </p>
          <p className="text-xs text-muted-foreground/70">
            {formatRelativeTime(scannedAt)}
          </p>
        </div>
      </div>

      <Separator orientation="vertical" className="h-12" />

      <div className="flex items-center gap-3">
        <div
          className={cn(
            "size-10 rounded-xl flex items-center justify-center border",
            totalColdRepos > 0
              ? "bg-red-500/10 border-red-500/15"
              : "bg-emerald-500/10 border-emerald-500/15",
          )}
        >
          <Database
            className={cn(
              "size-5",
              totalColdRepos > 0
                ? "text-red-600 dark:text-red-400"
                : "text-emerald-600 dark:text-emerald-400",
            )}
          />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
            冷仓库数量
          </p>
          <p
            className={cn(
              "text-lg font-bold tracking-tight tabular-nums",
              totalColdRepos > 0
                ? "text-red-600 dark:text-red-400"
                : "text-emerald-600 dark:text-emerald-400",
            )}
          >
            {(totalColdRepos).toLocaleString()}
          </p>
          <p className="text-xs text-muted-foreground/70">
            {totalColdRepos > 0 ? "活跃但长期无下载" : "所有仓库均活跃"}
          </p>
        </div>
      </div>

      <Separator orientation="vertical" className="h-12" />

      <div className="flex items-center gap-3">
        <div
          className={cn(
            "size-10 rounded-xl flex items-center justify-center border",
            totalOrphanRepos > 0
              ? "bg-amber-500/10 border-amber-500/15"
              : "bg-emerald-500/10 border-emerald-500/15",
          )}
        >
          <Database
            className={cn(
              "size-5",
              totalOrphanRepos > 0
                ? "text-amber-600 dark:text-amber-400"
                : "text-emerald-600 dark:text-emerald-400",
            )}
          />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
            孤儿仓库数量
          </p>
          <p
            className={cn(
              "text-lg font-bold tracking-tight tabular-nums",
              totalOrphanRepos > 0
                ? "text-amber-600 dark:text-amber-400"
                : "text-emerald-600 dark:text-emerald-400",
            )}
          >
            {(totalOrphanRepos).toLocaleString()}
          </p>
          <p className="text-xs text-muted-foreground/70">
            {totalOrphanRepos > 0 ? "已失效的残留存储" : "无孤儿存储"}
          </p>
        </div>
      </div>

      <Separator orientation="vertical" className="h-12" />

      <div className="flex items-center gap-3">
        <div
          className={cn(
            "size-10 rounded-xl flex items-center justify-center border",
            totalUntrackedRepos > 0
              ? "bg-purple-500/10 border-purple-500/15"
              : "bg-emerald-500/10 border-emerald-500/15",
          )}
        >
          <HelpCircle
            className={cn(
              "size-5",
              totalUntrackedRepos > 0
                ? "text-purple-600 dark:text-purple-400"
                : "text-emerald-600 dark:text-emerald-400",
            )}
          />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
            未追踪仓库
          </p>
          <p
            className={cn(
              "text-lg font-bold tracking-tight tabular-nums",
              totalUntrackedRepos > 0
                ? "text-purple-600 dark:text-purple-400"
                : "text-emerald-600 dark:text-emerald-400",
            )}
          >
            {(totalUntrackedRepos).toLocaleString()}
          </p>
          <p className="text-xs text-muted-foreground/70">
            {totalUntrackedRepos > 0 ? "S3有数据但DB无记录" : "无遗留数据"}
          </p>
        </div>
      </div>

      <Separator orientation="vertical" className="h-12" />

      <div className="flex items-center gap-3">
        <div className="size-10 rounded-xl bg-violet-500/10 border border-violet-500/15 flex items-center justify-center">
          <HardDrive className="size-5 text-violet-600 dark:text-violet-400" />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
            缓存占用
          </p>
          <p className="text-lg font-bold tracking-tight tabular-nums">
            {formatBytes(totalWastedBytes)}
          </p>
          <p className="text-xs text-muted-foreground/70">
            {totalRepos > 0 ? (
              <>
                涉及{" "}
                <span className="font-medium text-foreground/80">
                  {(totalRepos).toLocaleString()}
                </span>{" "}
                个仓库
              </>
            ) : (
              "缓存占用正常"
            )}
          </p>
        </div>
      </div>
    </motion.div>
  );
}
