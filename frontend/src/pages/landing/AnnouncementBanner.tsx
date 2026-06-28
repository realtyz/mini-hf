import { useState, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Info,
  AlertTriangle,
  AlertCircle,
  Pin,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useAnnouncementList } from "@/hooks/api";
import type { AnnouncementType } from "@/lib/api/types";

const DISMISSED_KEY = "announcements_dismissed";

interface AnnouncementBannerProps {
  className?: string;
}

const typeConfig: Record<
  AnnouncementType,
  {
    icon: React.ReactNode;
    bgClass: string;
    textClass: string;
    borderClass: string;
  }
> = {
  info: {
    icon: <Info className="h-4 w-4" />,
    bgClass: "bg-sky-50 dark:bg-sky-950/80",
    textClass: "text-sky-800 dark:text-sky-200",
    borderClass: "border-sky-300 dark:border-sky-700",
  },
  warning: {
    icon: <AlertTriangle className="h-4 w-4" />,
    bgClass: "bg-amber-50 dark:bg-amber-950/80",
    textClass: "text-amber-800 dark:text-amber-200",
    borderClass: "border-amber-300 dark:border-amber-700",
  },
  urgent: {
    icon: <AlertCircle className="h-4 w-4" />,
    bgClass: "bg-red-50 dark:bg-red-950/80",
    textClass: "text-red-800 dark:text-red-200",
    borderClass: "border-red-300 dark:border-red-700",
  },
};

function getDismissedIds(): number[] {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((id: unknown) => typeof id === "number")
      : [];
  } catch {
    return [];
  }
}

export function AnnouncementBanner({ className }: AnnouncementBannerProps) {
  const { data, isLoading } = useAnnouncementList();
  const [dismissedIds, setDismissedIds] = useState<number[]>(getDismissedIds);
  const [expanded, setExpanded] = useState(false);

  const visible = useMemo(() => {
    if (!data?.data) return [];
    return data.data.filter((a) => a.is_active && !dismissedIds.includes(a.id));
  }, [data, dismissedIds]);

  const displayed = expanded ? visible : visible.slice(0, 2);
  const hasMore = visible.length > 2;

  const dismiss = useCallback((id: number) => {
    setDismissedIds((prev) => {
      const next = [...prev, id];
      localStorage.setItem(DISMISSED_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  if (isLoading || visible.length === 0) {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className={className}
    >
      <div className="border-b">
        <div className="container mx-auto px-4">
          <div className="flex flex-col py-2 gap-1.5">
            <AnimatePresence mode="popLayout">
              {displayed.map((announcement) => {
                const config =
                  typeConfig[announcement.announcement_type] || typeConfig.info;
                return (
                  <motion.div
                    key={announcement.id}
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                    className={`
                      ${config.bgClass} ${config.textClass}
                      border-l-4 ${config.borderClass}
                      rounded-r-lg px-3 py-2
                    `}
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="shrink-0">{config.icon}</span>
                      {announcement.is_pinned && (
                        <Pin className="h-3.5 w-3.5 shrink-0 rotate-45 opacity-70" />
                      )}
                      {announcement.title && (
                        <span className="text-sm font-semibold shrink-0">
                          {announcement.title}
                        </span>
                      )}
                      <span className="text-sm flex-1 truncate">
                        {announcement.content}
                      </span>
                      <button
                        onClick={() => dismiss(announcement.id)}
                        className="shrink-0 p-1 rounded-md hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
                        aria-label="关闭公告"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
            {hasMore && (
              <button
                onClick={() => setExpanded((prev) => !prev)}
                className="flex items-center justify-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors py-0.5"
              >
                {expanded ? (
                  <>
                    <ChevronUp className="h-3 w-3" />
                    收起
                  </>
                ) : (
                  <>
                    <ChevronDown className="h-3 w-3" />
                    显示全部 ({visible.length})
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
