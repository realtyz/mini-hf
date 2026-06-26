import { motion } from "framer-motion";
import { Plus, Users2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface UsersEmptyStateProps {
  search: string;
  onCreate: () => void;
}

export function UsersEmptyState({ search, onCreate }: UsersEmptyStateProps) {
  return (
    <div className="relative rounded-2xl border border-border/60 bg-card overflow-hidden">
      {/* Top accent line */}
      <div className="absolute top-0 left-4 right-4 h-px bg-linear-to-r from-transparent via-border/40 to-transparent" />
      <div className="flex h-72 items-center justify-center">
        <div className="text-center">
          <motion.div
            initial={{ y: 10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="relative mx-auto w-fit mb-5"
          >
            <div className="size-16 rounded-2xl bg-muted/50 flex items-center justify-center">
              <Users2 className="size-6 text-muted-foreground/30" />
            </div>
          </motion.div>
          <motion.p
            initial={{ y: 10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.15 }}
            className="text-sm font-medium"
          >
            {search ? "未找到匹配用户" : "暂无用户"}
          </motion.p>
          <motion.p
            initial={{ y: 10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="text-sm text-muted-foreground/70 mt-1"
          >
            {search
              ? "尝试使用其他关键词搜索，或清除搜索条件查看全部用户"
              : "开始添加第一个用户来管理系统访问权限"}
          </motion.p>
          {!search && (
            <motion.div
              initial={{ y: 10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.2 }}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <Button
                size="sm"
                className="mt-4 rounded-xl gap-2"
                onClick={onCreate}
              >
                <Plus className="size-3.5" />
                新建用户
              </Button>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}
