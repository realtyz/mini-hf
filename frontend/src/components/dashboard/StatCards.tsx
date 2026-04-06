import {
  IconDatabase,
  IconFile,
  IconDeviceSdCard,
  IconDownload,
} from "@tabler/icons-react";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useDashboardStats } from "@/hooks/api/use-dashboard-queries";
import { cn } from "@/lib/utils";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { memo, useEffect, useRef, useState } from "react";

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

interface StatCardProps {
  title: string;
  value: number;
  icon: React.ReactNode;
  description: string;
  color: "blue" | "green" | "yellow" | "purple";
  isLoading?: boolean;
  index: number;
  isStorage?: boolean;
}

const colorConfig = {
  blue: {
    gradient: "from-blue-500/10 via-blue-500/5 to-transparent",
    iconBg: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
    border: "hover:border-blue-500/30",
    glow: "group-hover:shadow-blue-500/10",
    accent: "bg-blue-500",
  },
  green: {
    gradient: "from-emerald-500/10 via-emerald-500/5 to-transparent",
    iconBg: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    border: "hover:border-emerald-500/30",
    glow: "group-hover:shadow-emerald-500/10",
    accent: "bg-emerald-500",
  },
  yellow: {
    gradient: "from-amber-500/10 via-amber-500/5 to-transparent",
    iconBg: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    border: "hover:border-amber-500/30",
    glow: "group-hover:shadow-amber-500/10",
    accent: "bg-amber-500",
  },
  purple: {
    gradient: "from-violet-500/10 via-violet-500/5 to-transparent",
    iconBg: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
    border: "hover:border-violet-500/30",
    glow: "group-hover:shadow-violet-500/10",
    accent: "bg-violet-500",
  },
};

// Animated counter component
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

// Magnetic card with mouse tracking
const StatCard = memo(function StatCard({
  title,
  value,
  icon,
  description,
  color,
  isLoading,
  index,
  isStorage,
}: StatCardProps) {
  const colors = colorConfig[color];
  const cardRef = useRef<HTMLDivElement>(null);
  const [isHovered, setIsHovered] = useState(false);

  const x = useMotionValue(0);
  const y = useMotionValue(0);

  const rotateX = useSpring(useTransform(y, [-0.5, 0.5], [5, -5]), {
    stiffness: 300,
    damping: 30,
  });
  const rotateY = useSpring(useTransform(x, [-0.5, 0.5], [-5, 5]), {
    stiffness: 300,
    damping: 30,
  });

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    x.set((e.clientX - centerX) / rect.width);
    y.set((e.clientY - centerY) / rect.height);
  };

  const handleMouseLeave = () => {
    x.set(0);
    y.set(0);
    setIsHovered(false);
  };

  // Format display value
  const displayValue = isStorage
    ? formatStorageCapacity(value)
    : value.toLocaleString();

  return (
    <motion.div
      ref={cardRef}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.5,
        delay: index * 0.1,
        ease: [0.16, 1, 0.3, 1],
      }}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={handleMouseLeave}
      style={{ rotateX, rotateY, transformPerspective: 1000 }}
      className="will-change-transform"
    >
      <Card
        className={cn(
          "group relative overflow-hidden border transition-all duration-300 cursor-default",
          "hover:shadow-xl hover:shadow-black/5 dark:hover:shadow-black/20",
          colors.border,
          colors.glow,
          isHovered && "shadow-xl",
        )}
      >
        {/* Gradient background */}
        <motion.div
          className={cn(
            "absolute inset-0 bg-linear-to-br opacity-60",
            colors.gradient,
          )}
          animate={{ opacity: isHovered ? 1 : 0.6 }}
          transition={{ duration: 0.3 }}
        />

        {/* Spotlight effect */}
        <motion.div
          className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
          style={{
            background: `radial-gradient(600px circle at var(--mouse-x, 50%) var(--mouse-y, 50%), ${color === "blue" ? "rgba(59, 130, 246, 0.06)" : color === "green" ? "rgba(16, 185, 129, 0.06)" : color === "yellow" ? "rgba(245, 158, 11, 0.06)" : "rgba(139, 92, 246, 0.06)"}, transparent 40%)`,
          }}
        />

        {/* Subtle grid pattern */}
        <div className="absolute inset-0 opacity-[0.02] bg-[linear-gradient(rgba(0,0,0,0.1)_1px,transparent_1px),linear-gradient(90deg,rgba(0,0,0,0.1)_1px,transparent_1px)] bg-size-[20px_20px]" />

        {/* Accent line */}
        <motion.div
          className={cn(
            "absolute bottom-0 left-0 right-0 h-0.5",
            colors.accent,
          )}
          initial={{ scaleX: 0 }}
          animate={{ scaleX: isHovered ? 1 : 0 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          style={{ originX: 0 }}
        />

        <CardHeader className="relative pb-4">
          <div className="flex items-start justify-between">
            <div className="space-y-3">
              {/* Icon with pulse animation */}
              <motion.div
                className={cn(
                  "inline-flex h-11 w-11 items-center justify-center rounded-xl",
                  colors.iconBg,
                )}
                animate={{ scale: isHovered ? 1.05 : 1 }}
                transition={{ duration: 0.2 }}
              >
                {icon}
              </motion.div>

              {/* Title */}
              <CardDescription className="text-sm font-medium text-muted-foreground">
                {title}
              </CardDescription>
            </div>

            {/* Value */}
            {isLoading ? (
              <Skeleton className="h-10 w-20" />
            ) : (
              <CardTitle className="text-2xl font-bold tracking-tight">
                {isStorage ? displayValue : <AnimatedCounter value={value} />}
              </CardTitle>
            )}
          </div>

          {/* Description */}
          <p className="text-xs text-muted-foreground/80 mt-2">{description}</p>
        </CardHeader>
      </Card>
    </motion.div>
  );
});

export function StatCards() {
  const { stats, isLoading } = useDashboardStats();

  const cards = [
    {
      title: "存储容量",
      value: stats.storageCapacity,
      icon: <IconDeviceSdCard className="h-5 w-5" />,
      description: "S3 存储桶总大小",
      color: "yellow" as const,
      isStorage: true,
    },
    {
      title: "文件数量",
      value: stats.totalFiles,
      icon: <IconFile className="h-5 w-5" />,
      description: "S3 存储桶中的文件总数",
      color: "green" as const,
    },
    {
      title: "仓库总数",
      value: stats.totalRepos,
      icon: <IconDatabase className="h-5 w-5" />,
      description: "已缓存的 HuggingFace 仓库",
      color: "blue" as const,
    },
    {
      title: "下载次数",
      value: stats.totalDownloads,
      icon: <IconDownload className="h-5 w-5" />,
      description: "所有仓库的总下载次数",
      color: "purple" as const,
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

// Alias export for compatibility
export { StatCards as SectionCards };

export default StatCards;
