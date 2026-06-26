import { Loader2 } from "lucide-react";
import { motion } from "framer-motion";

interface LoadingSkeletonProps {
  /** Height class for the container. Default: "h-64" */
  height?: string;
  /** Show a spinning loader. If false, shows nothing (parent renders own skeleton). */
  showSpinner?: boolean;
  message?: string;
}

export function LoadingSkeleton({
  height = "h-64",
  showSpinner = true,
  message = "加载中...",
}: LoadingSkeletonProps) {
  if (!showSpinner) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className={`flex ${height} items-center justify-center`}
    >
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
        >
          <Loader2 className="size-8" />
        </motion.div>
        <span className="text-sm">{message}</span>
      </div>
    </motion.div>
  );
}
