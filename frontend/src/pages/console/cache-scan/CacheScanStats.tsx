import { motion } from "framer-motion";
import { instrumentContainer, instrumentItem } from "@/lib/animations/motion-config";
import { Clock, Database, HelpCircle, HardDrive } from "lucide-react";
import { formatBytes } from "@/lib/utils";

interface CacheScanStatsProps {
  scannedAt: string;
  totalTrackedRepos: number;
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

interface StatReadingProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string | React.ReactNode;
}

function StatReading({ icon, label, value, sub }: StatReadingProps) {
  return (
    <motion.div variants={instrumentItem} className="flex-1 min-w-0">
      <div className="h-full rounded-xl border border-border/50 bg-card px-5 py-4">
        <div className="flex flex-col gap-2">
          {/* Top row: icon + label */}
          <div className="flex items-center gap-2">
            <div className="text-muted-foreground/60">
              {icon}
            </div>
            <span className="text-[11px] font-medium tracking-wider uppercase text-muted-foreground/50">
              {label}
            </span>
          </div>

          {/* Value */}
          <span className="text-2xl font-semibold leading-none tracking-tight tabular-nums text-foreground">
            {value}
          </span>

          {/* Sub label */}
          <span className="text-[12px] leading-relaxed text-muted-foreground/50">
            {sub}
          </span>
        </div>
      </div>
    </motion.div>
  );
}

export function CacheScanStats({
  scannedAt,
  totalTrackedRepos,
  totalUntrackedRepos,
  totalWastedBytes,
}: CacheScanStatsProps) {
  return (
    <motion.div
      variants={instrumentContainer}
      initial="hidden"
      animate="visible"
      className="flex items-stretch gap-4"
    >
      <StatReading
        icon={<Clock size={16} />}
        label="扫描时间"
        value={formatDate(scannedAt)}
        sub={formatRelativeTime(scannedAt)}
      />

      <StatReading
        icon={<Database size={16} />}
        label="已追踪仓库"
        value={totalTrackedRepos.toLocaleString()}
        sub={totalTrackedRepos > 0 ? "已注册的缓存仓库" : "无已追踪仓库"}
      />

      <StatReading
        icon={<HelpCircle size={16} />}
        label="未追踪仓库"
        value={totalUntrackedRepos.toLocaleString()}
        sub={totalUntrackedRepos > 0 ? "S3 有数据但 DB 无记录" : "无遗留数据"}
      />

      <StatReading
        icon={<HardDrive size={16} />}
        label="缓存占用"
        value={formatBytes(totalWastedBytes)}
        sub={
          totalUntrackedRepos + totalTrackedRepos > 0 ? (
            <>
              涉及{" "}
              <span className="font-medium text-foreground/60">
                {(totalTrackedRepos + totalUntrackedRepos).toLocaleString()}
              </span>{" "}
              个仓库
            </>
          ) : (
            "缓存占用正常"
          )
        }
      />
    </motion.div>
  );
}
