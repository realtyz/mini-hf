import { motion } from "framer-motion";
import { itemVariants } from "@/lib/animations/motion-config";
import { cn } from "@/lib/utils";

interface RepositoryFilterShellProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Shared filter-card surface for the repositories pages: a rounded card with a
 * subtle top accent line and a soft hover shadow. Pure presentation — owns no
 * query, filter, or routing state. Used by both the public and console shells.
 */
export function RepositoryFilterShell({
  children,
  className,
}: RepositoryFilterShellProps) {
  return (
    <motion.div
      className={cn(
        "relative rounded-2xl border border-border/60 bg-card overflow-hidden",
        className,
      )}
      variants={itemVariants}
      whileHover={{
        boxShadow: "0 4px 24px -6px rgba(0, 0, 0, 0.06)",
      }}
      transition={{ duration: 0.25 }}
    >
      {/* Subtle top accent line */}
      <div className="absolute top-0 left-4 right-4 h-px bg-linear-to-r from-transparent via-border/40 to-transparent" />
      {children}
    </motion.div>
  );
}
