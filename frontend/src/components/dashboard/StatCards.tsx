import { Database, File, HardDrive, Download } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useDashboardStats } from "@/hooks/api/use-dashboard-queries";
import { motion, useSpring, useTransform } from "framer-motion";
import { memo, useEffect } from "react";
import { prefersReducedMotion } from "@/lib/animations/motion-config";

/**
 * Format storage capacity from bytes to human readable format
 */
function formatStorageCapacity(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes < 1024 * 1024 * 1024 * 1024)
    return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
  return `${(bytes / 1024 / 1024 / 1024 / 1024).toFixed(2)} TB`;
}

// Animated counter — the one motion we keep, because it signals "live data".
function AnimatedCounter({ value }: { value: number }) {
  const spring = useSpring(0, { stiffness: 50, damping: 20 });
  const display = useTransform(spring, (current) =>
    Math.round(current).toLocaleString(),
  );

  useEffect(() => {
    spring.set(value);
  }, [spring, value]);

  return <motion.span className="tabular-nums">{display}</motion.span>;
}

interface StatCardProps {
  title: string;
  value: number;
  icon: React.ReactNode;
  description: string;
  descriptionNode?: React.ReactNode;
  isLoading?: boolean;
  isStorage?: boolean;
  index: number;
}

const StatCard = memo(function StatCard({
  title,
  value,
  icon,
  description,
  descriptionNode,
  isLoading,
  isStorage,
  index,
}: StatCardProps) {
  const displayValue = isStorage
    ? formatStorageCapacity(value)
    : value.toLocaleString();

  return (
    <motion.div
      initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: prefersReducedMotion ? 0 : 0.4,
        delay: prefersReducedMotion ? 0 : index * 0.06,
        ease: [0.16, 1, 0.3, 1],
      }}
    >
      <Card className="group gap-0 py-5 transition-colors duration-200 hover:border-foreground/15">
        <CardHeader className="gap-0 px-6">
          <div className="flex items-center justify-between">
            <CardDescription className="text-xs font-medium text-muted-foreground">
              {title}
            </CardDescription>
            <span className="flex size-8 items-center justify-center rounded-lg bg-muted/60 text-muted-foreground transition-colors duration-200 group-hover:bg-muted group-hover:text-foreground">
              {icon}
            </span>
          </div>
          <CardTitle className="mt-4 text-[28px] leading-none font-semibold tracking-tight tabular-nums">
            {isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : isStorage ? (
              displayValue
            ) : (
              <AnimatedCounter value={value} />
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-6 pt-2">
          {descriptionNode ?? (
            <p className="text-[11px] text-muted-foreground/70">{description}</p>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
});

export function StatCards() {
  const { stats, isLoading } = useDashboardStats();

  const repoSplit = (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-medium bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
        HuggingFace
        <span className="tabular-nums">{stats.hfRepos}</span>
      </span>
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-medium bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-300">
        ModelScope
        <span className="tabular-nums">{stats.msRepos}</span>
      </span>
    </div>
  );

  const cards = [
    {
      title: "存储容量",
      value: stats.storageCapacity,
      icon: <HardDrive className="size-4" />,
      description: "S3 存储桶总大小",
      isStorage: true,
    },
    {
      title: "文件数量",
      value: stats.totalFiles,
      icon: <File className="size-4" />,
      description: "S3 存储桶中的文件总数",
    },
    {
      title: "仓库总数",
      value: stats.totalRepos,
      icon: <Database className="size-4" />,
      description: "已缓存的 HuggingFace / ModelScope 仓库",
      descriptionNode: repoSplit,
    },
    {
      title: "下载次数",
      value: stats.totalDownloads,
      icon: <Download className="size-4" />,
      description: "所有仓库的总下载次数",
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card, index) => (
        <StatCard
          key={card.title}
          {...card}
          isLoading={isLoading}
          index={index}
        />
      ))}
    </div>
  );
}
