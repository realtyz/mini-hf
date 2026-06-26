import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { motion, AnimatePresence } from "framer-motion";

interface TaskAlertBannerProps {
  visible: boolean;
  pendingCount: number;
  isFilteringPending: boolean;
  onFilterPending: () => void;
}

export function TaskAlertBanner({
  visible,
  pendingCount,
  isFilteringPending,
  onFilterPending,
}: TaskAlertBannerProps) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: -20, height: 0 }}
          animate={{ opacity: 1, y: 0, height: "auto" }}
          exit={{ opacity: 0, y: -20, height: 0 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="mb-6 overflow-hidden"
        >
          <Alert className="border-amber-200/60 bg-amber-50/60 dark:bg-amber-950/20 dark:border-amber-800/40 rounded-xl">
            <AlertCircle className="size-4 text-amber-500 dark:text-amber-400" />
            <AlertTitle className="text-amber-900 dark:text-amber-100 font-semibold text-sm">
              待处理任务
            </AlertTitle>
            <AlertDescription className="flex items-center justify-between text-amber-700 dark:text-amber-300 text-sm mt-1">
              <span>
                当前有{" "}
                <motion.strong
                  className="font-semibold"
                  initial={{ scale: 1 }}
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ duration: 0.5, delay: 0.2 }}
                >
                  {pendingCount}
                </motion.strong>{" "}
                个任务等待审批
              </span>
              {!isFilteringPending && (
                <motion.div
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onFilterPending}
                    className="border-amber-300 hover:bg-amber-100 dark:border-amber-700 dark:hover:bg-amber-800/40"
                  >
                    查看待审批
                  </Button>
                </motion.div>
              )}
            </AlertDescription>
          </Alert>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
