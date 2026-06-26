import { motion } from "framer-motion";
import { AlertCircle } from "lucide-react";

interface PreviewErrorStateProps {
  message: string;
}

const contentVariants = {
  initial: { opacity: 0, x: 20 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -20 },
};

export function PreviewErrorState({ message }: PreviewErrorStateProps) {
  return (
    <motion.div
      key="preview-error"
      variants={contentVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={{ duration: 0.3 }}
      className="flex flex-col items-center justify-center py-12 px-6"
    >
      <motion.div
        initial={{ scale: 0.8 }}
        animate={{ scale: 1 }}
        className="w-20 h-20 rounded-full bg-destructive/10 flex items-center justify-center mb-4"
      >
        <AlertCircle className="w-10 h-10 text-destructive" />
      </motion.div>
      <h3 className="text-lg font-semibold text-destructive mb-2">预览失败</h3>
      <p className="text-sm text-muted-foreground text-center max-w-md">
        {message || "获取仓库信息失败，请检查仓库ID和配置后重试"}
      </p>
    </motion.div>
  );
}
