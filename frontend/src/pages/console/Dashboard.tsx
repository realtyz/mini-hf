import { ChartSection } from "@/components/dashboard/ChartSection";
import { StatCards } from "@/components/dashboard/StatCards";
import { RecentTasks } from "@/components/dashboard/RecentTasks";
import { motion } from "framer-motion";
import { LayoutDashboard, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/PageHeader";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { useAuthStore } from "@/stores/auth-store";
import { containerVariants, itemVariants } from "@/lib/animations/motion-config";

export function Dashboard() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const isAdmin = user?.role === "admin";

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });
    queryClient.invalidateQueries({ queryKey: queryKeys.repos.all });
    queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });
  };

  return (
    <motion.div
      className="flex flex-1 flex-col gap-8"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* 页面标题 */}
      <motion.div variants={itemVariants}>
        <PageHeader
          icon={LayoutDashboard}
          title="仪表盘"
          subtitle="系统概览与实时监控数据"
          actions={
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              className="w-24 gap-2 cursor-pointer text-[13px] h-8"
            >
              <RefreshCw className="size-3.5" />
              刷新
            </Button>
          }
        />
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
