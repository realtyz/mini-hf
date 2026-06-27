import type { ReactNode } from "react";
import {
  Clock,
  Pause,
  Play,
  XCircle,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";

/** The non-"none" bottom-action types rendered as a banner bar. */
export type DrawerActionType =
  | "refresh"
  | "paused"
  | "pausing"
  | "cancelled"
  | "failed";

type ActionKey = "refresh" | "cancel" | "resume" | "retry";

interface ActionDef {
  icon: ReactNode;
  label: string;
  pendingLabel: string;
  /** Button visual tone. */
  tone: "outline-red" | "outline-blue" | "primary-blue";
}

const ACTION_DEFS: Record<ActionKey, ActionDef> = {
  refresh: {
    icon: <RefreshCw className="mr-1 h-3 w-3" />,
    label: "刷新",
    pendingLabel: "刷新中...",
    tone: "outline-blue",
  },
  cancel: {
    icon: <XCircle className="mr-1 h-3 w-3" />,
    label: "取消任务",
    pendingLabel: "取消中...",
    tone: "outline-red",
  },
  resume: {
    icon: <Play className="mr-1 h-3 w-3" />,
    label: "恢复任务",
    pendingLabel: "恢复中...",
    tone: "primary-blue",
  },
  retry: {
    icon: <RefreshCw className="mr-1 h-3 w-3" />,
    label: "重试任务",
    pendingLabel: "重试中...",
    tone: "primary-blue",
  },
};

interface BannerConfig {
  bannerClass: string;
  icon: ReactNode;
  /** Tailwind classes for the banner icon container text color. */
  message: string;
  actions: ActionKey[];
}

const BANNER_CONFIG: Record<DrawerActionType, BannerConfig> = {
  refresh: {
    bannerClass:
      "bg-blue-50/60 dark:bg-blue-950/20 border border-blue-200/60 dark:border-blue-800/40",
    icon: <Clock className="h-3.5 w-3.5" />,
    message: "任务排队中，等待执行",
    actions: ["refresh", "cancel"],
  },
  paused: {
    bannerClass:
      "bg-yellow-50/60 dark:bg-yellow-950/20 border border-yellow-200/60 dark:border-yellow-800/40",
    icon: <Pause className="h-3.5 w-3.5" />,
    message: "任务已暂停",
    actions: ["resume", "cancel"],
  },
  pausing: {
    bannerClass:
      "bg-yellow-50/60 dark:bg-yellow-950/20 border border-yellow-200/60 dark:border-yellow-800/40",
    icon: <Clock className="h-3.5 w-3.5 animate-pulse" />,
    message: "正在暂停任务，请稍候...",
    actions: ["cancel"],
  },
  cancelled: {
    bannerClass:
      "bg-slate-50/60 dark:bg-slate-950/20 border border-slate-200/60 dark:border-slate-800/40",
    icon: <XCircle className="h-3.5 w-3.5" />,
    message: "任务已取消",
    actions: ["retry"],
  },
  failed: {
    bannerClass:
      "bg-red-50/60 dark:bg-red-950/20 border border-red-200/60 dark:border-red-800/40",
    icon: <AlertCircle className="h-3.5 w-3.5" />,
    message: "任务失败",
    actions: ["retry"],
  },
};

const BANNER_TEXT_CLASS: Record<DrawerActionType, string> = {
  refresh: "text-blue-700 dark:text-blue-300",
  paused: "text-yellow-700 dark:text-yellow-300",
  pausing: "text-yellow-700 dark:text-yellow-300",
  cancelled: "text-slate-700 dark:text-slate-300",
  failed: "text-red-700 dark:text-red-300",
};

const CANCEL_BTN_CLASS =
  "h-7 text-[12px] border-red-200 hover:bg-red-50 hover:text-red-600 active:bg-red-100 dark:border-red-800/50 dark:hover:bg-red-950/40 dark:hover:text-red-400 dark:active:bg-red-950/60";

const REFRESH_BTN_CLASS =
  "h-7 text-[12px] border-blue-300 hover:bg-blue-100 active:bg-blue-200 dark:border-blue-700 dark:hover:bg-blue-800/40 dark:active:bg-blue-800/60";

const PRIMARY_BTN_CLASS =
  "h-7 text-[12px] bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white";

interface DrawerActionBarProps {
  type: DrawerActionType;
  canCancel: boolean;
  canResume: boolean;
  canRetry: boolean;
  onCancel: () => void;
  onResume: () => void;
  onRetry: () => void;
  onRefresh: () => void;
  isCancelPending: boolean;
  isResumePending: boolean;
  isRetryPending: boolean;
}

export function DrawerActionBar({
  type,
  canCancel,
  canResume,
  canRetry,
  onCancel,
  onResume,
  onRetry,
  onRefresh,
  isCancelPending,
  isResumePending,
  isRetryPending,
}: DrawerActionBarProps) {
  const config = BANNER_CONFIG[type];

  const isActionEnabled = (key: ActionKey): boolean => {
    switch (key) {
      case "refresh":
        return true;
      case "cancel":
        return canCancel;
      case "resume":
        return canResume;
      case "retry":
        return canRetry;
    }
  };

  const getHandler = (key: ActionKey): (() => void) | undefined => {
    switch (key) {
      case "refresh":
        return onRefresh;
      case "cancel":
        return onCancel;
      case "resume":
        return onResume;
      case "retry":
        return onRetry;
    }
  };

  const isPending = (key: ActionKey): boolean => {
    switch (key) {
      case "refresh":
        return false;
      case "cancel":
        return isCancelPending;
      case "resume":
        return isResumePending;
      case "retry":
        return isRetryPending;
    }
  };

  const getButtonClass = (key: ActionKey): string => {
    const tone = ACTION_DEFS[key].tone;
    if (tone === "outline-red") return CANCEL_BTN_CLASS;
    if (tone === "outline-blue") return REFRESH_BTN_CLASS;
    return PRIMARY_BTN_CLASS;
  };

  return (
    <div
      className={`flex items-center justify-between ${config.bannerClass} rounded-xl px-4 py-3 mt-1`}
    >
      <div
        className={`flex items-center gap-2 text-[13px] font-medium ${BANNER_TEXT_CLASS[type]}`}
      >
        {config.icon}
        <span>{config.message}</span>
      </div>
      <div className="flex gap-2">
        {config.actions.map((key) => {
          if (!isActionEnabled(key)) return null;
          const def = ACTION_DEFS[key];
          return (
            <Button
              key={key}
              size="sm"
              variant={def.tone === "primary-blue" ? "default" : "outline"}
              onClick={getHandler(key)}
              className={getButtonClass(key)}
            >
              {def.icon}
              {isPending(key) ? def.pendingLabel : def.label}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
