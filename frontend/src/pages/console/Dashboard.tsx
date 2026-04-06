import { ChartSection } from "@/components/dashboard/ChartSection";
import { StatCards } from "@/components/dashboard/StatCards";
import { RecentTasks } from "@/components/dashboard/RecentTasks";
import { motion } from "framer-motion";
import { LayoutDashboard, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { useAuthStore } from "@/stores/auth-store";

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.5,
      ease: [0.16, 1, 0.3, 1] as const,
    },
  },
};

export function Dashboard() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const isAdmin = user?.role === "admin";

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });
    queryClient.invalidateQueries({ queryKey: queryKeys.repos.all });
  };

  return (
    <motion.div
      className="flex flex-1 flex-col gap-8"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* 页面标题 */}
      <motion.div
        variants={itemVariants}
        className="flex items-center justify-between"
      >
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-xl bg-primary/5 border border-primary/10 flex items-center justify-center">
            <LayoutDashboard className="size-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">仪表盘</h1>
            <p className="text-[13px] text-muted-foreground mt-0.5">
              系统概览与实时监控数据
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          className="w-24 gap-2 cursor-pointer text-[13px] h-8"
        >
          <RefreshCw className="size-3.5" />
          刷新
        </Button>
      </motion.div>

      {/* 统计卡片 */}
      <motion.div variants={itemVariants}>
        <StatCards />
      </motion.div>

      {/* 图表区域 - 仅管理员可见 */}
      {isAdmin && (
        <motion.div variants={itemVariants}>
          <ChartSection />
        </motion.div>
      )}

      {/* 最近任务列表 */}
      <motion.div variants={itemVariants}>
        <RecentTasks />
      </motion.div>
    </motion.div>
  );
}

export default Dashboard;
