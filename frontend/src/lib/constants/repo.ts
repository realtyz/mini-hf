import type { RepoStatus } from "@/lib/api/types";

/** Accent color family used for repo status theming (ring / hover border). */
export type RepoStatusAccent = "emerald" | "slate" | "sky" | "amber" | "red";

export interface RepoStatusConfig {
  label: string;
  dotClass: string;
  badgeVariant: "success" | "neutral" | "info" | "danger";
  /** Accent color family for ring / hover-border theming. */
  accent: RepoStatusAccent;
  /** Ring class for status-themed emphasis. */
  ring: string;
  /** Hover border class for status-themed cards. */
  hoverBorder: string;
}

export const REPO_STATUS_CONFIG: Record<RepoStatus, RepoStatusConfig> = {
  active: {
    label: "活跃",
    dotClass: "bg-emerald-500",
    badgeVariant: "success",
    accent: "emerald",
    ring: "ring-emerald-500/20",
    hoverBorder:
      "hover:border-emerald-500/30 dark:hover:border-emerald-500/25",
  },
  inactive: {
    label: "不完整",
    dotClass: "bg-slate-400",
    badgeVariant: "neutral",
    accent: "slate",
    ring: "ring-slate-400/20",
    hoverBorder: "hover:border-slate-400/40 dark:hover:border-slate-500/30",
  },
  updating: {
    label: "更新中",
    dotClass: "bg-sky-500 animate-pulse",
    badgeVariant: "info",
    accent: "sky",
    ring: "ring-sky-500/20",
    hoverBorder: "hover:border-sky-500/30 dark:hover:border-sky-500/25",
  },
  cleaning: {
    label: "清理中",
    dotClass: "bg-red-500",
    badgeVariant: "danger",
    accent: "red",
    ring: "ring-red-500/20",
    hoverBorder: "hover:border-red-500/30 dark:hover:border-red-500/25",
  },
  cleaned: {
    label: "已清理",
    dotClass: "bg-amber-500",
    badgeVariant: "neutral",
    accent: "amber",
    ring: "ring-amber-500/20",
    hoverBorder: "hover:border-amber-500/30 dark:hover:border-amber-500/25",
  },
};

export function getRepoStatusLabel(status: RepoStatus): string {
  return REPO_STATUS_CONFIG[status]?.label ?? status;
}

export function getRepoStatusDotClass(status: RepoStatus): string {
  return REPO_STATUS_CONFIG[status]?.dotClass ?? "bg-slate-400";
}

export const SNAPSHOT_STATUS_CONFIG = {
  active: {
    label: "活跃",
    className:
      "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300",
  },
  inactive: {
    label: "未完成",
    className:
      "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  },
  archived: {
    label: "已归档",
    className:
      "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
  },
} as const;

export type SnapshotStatusType = keyof typeof SNAPSHOT_STATUS_CONFIG;
