import { motion } from "framer-motion";
import { instrumentContainer, instrumentItem } from "@/lib/animations/motion-config";
import { Clock, Database, HelpCircle, HardDrive } from "lucide-react";
import { cn, formatBytes } from "@/lib/utils";

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
  accent: "blue" | "emerald" | "purple" | "violet";
  hasData: boolean;
}

const accentMap = {
  blue: {
    bg: "bg-blue-500/8",
    border: "border-blue-500/15",
    icon: "text-blue-600 dark:text-blue-400",
    dot: "bg-blue-500",
  },
  emerald: {
    bg: "bg-emerald-500/8",
    border: "border-emerald-500/15",
    icon: "text-emerald-600 dark:text-emerald-400",
    dot: "bg-emerald-500",
  },
  purple: {
    bg: "bg-purple-500/8",
    border: "border-purple-500/15",
    icon: "text-purple-600 dark:text-purple-400",
    dot: "bg-purple-500",
  },
  violet: {
    bg: "bg-violet-500/8",
    border: "border-violet-500/15",
    icon: "text-violet-600 dark:text-violet-400",
    dot: "bg-violet-500",
  },
} as const;

function StatReading({ icon, label, value, sub, accent, hasData }: StatReadingProps) {
  const colors = accentMap[accent];

  return (
    <motion.div
      variants={instrumentItem}
      whileHover={{ y: -2, transition: { duration: 0.2 } }}
      className="flex-1 min-w-0"
    >
      <div
        className={cn(
          "relative group/card h-full rounded-2xl border px-5 py-4",
          "transition-all duration-300",
          hasData
            ? cn(colors.bg, colors.border, "hover:shadow-lg hover:shadow-slate-950/5")
            : "bg-muted/30 border-border/30",
        )}
      >
        {/* Subtle grid texture overlay */}
        <div
          className="pointer-events-none absolute inset-0 rounded-2xl opacity-[0.03] dark:opacity-[0.06]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)",
            backgroundSize: "12px 12px",
          }}
        />

        <div className="relative flex flex-col gap-2.5">
          {/* Top row: icon + label */}
          <div className="flex items-center gap-2.5">
            <div
              className={cn(
                "size-9 rounded-xl flex items-center justify-center transition-colors duration-300",
                hasData ? colors.bg : "bg-muted/40",
              )}
            >
              <div className={cn(hasData ? colors.icon : "text-muted-foreground/40")}>
                {icon}
              </div>
            </div>
            <span className="text-[11px] font-medium tracking-widest uppercase text-muted-foreground/60 select-none">
              {label}
            </span>

            {/* Status dot */}
            {hasData && (
              <div className="ml-auto flex items-center gap-1.5">
                <div className={cn("size-1.5 rounded-full", colors.dot, "animate-pulse")} />
              </div>
            )}
          </div>

          {/* Value — large display */}
          <div className="flex items-baseline gap-0.5">
            <span
              className={cn(
                "text-[28px] font-bold leading-none tracking-tight tabular-nums transition-colors duration-300",
                hasData ? "text-foreground" : "text-muted-foreground/30",
              )}
            >
              {value}
            </span>
          </div>

          {/* Sub label */}
          <div className="text-[12px] leading-relaxed text-muted-foreground/60">
            {sub}
          </div>

          {/* Mini bar indicator */}
          <div className="h-0.5 w-full rounded-full bg-border/30 overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-700",
                hasData ? colors.dot : "bg-transparent",
              )}
              style={{ width: hasData ? "100%" : "0%" }}
            />
          </div>
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
        icon={<Clock size={18} />}
        label="扫描时间"
        value={formatDate(scannedAt)}
        sub={formatRelativeTime(scannedAt)}
        accent="blue"
        hasData
      />

      <StatReading
        icon={<Database size={18} />}
        label="已追踪仓库"
        value={totalTrackedRepos.toLocaleString()}
        sub={totalTrackedRepos > 0 ? "已注册的缓存仓库" : "无已追踪仓库"}
        accent={totalTrackedRepos > 0 ? "blue" : "emerald"}
        hasData={totalTrackedRepos > 0}
      />

      <StatReading
        icon={<HelpCircle size={18} />}
        label="未追踪仓库"
        value={totalUntrackedRepos.toLocaleString()}
        sub={totalUntrackedRepos > 0 ? "S3 有数据但 DB 无记录" : "无遗留数据"}
        accent={totalUntrackedRepos > 0 ? "purple" : "emerald"}
        hasData={totalUntrackedRepos > 0}
      />

      <StatReading
        icon={<HardDrive size={18} />}
        label="缓存占用"
        value={formatBytes(totalWastedBytes)}
        sub={
          totalUntrackedRepos + totalTrackedRepos > 0 ? (
            <>
              涉及{" "}
              <span className="font-medium text-foreground/70">
                {(totalTrackedRepos + totalUntrackedRepos).toLocaleString()}
              </span>{" "}
              个仓库
            </>
          ) : (
            "缓存占用正常"
          )
        }
        accent="violet"
        hasData={totalWastedBytes > 0}
      />
    </motion.div>
  );
}
