import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { formatDistanceToNow as formatDistanceToNowBase } from "date-fns";
import { zhCN } from "date-fns/locale";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}秒`;
  } else if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}分${remainingSeconds > 0 ? remainingSeconds + "秒" : ""}`;
  } else {
    const hours = Math.floor(seconds / 3600);
    const remainingMinutes = Math.floor((seconds % 3600) / 60);
    return `${hours}小时${remainingMinutes > 0 ? remainingMinutes + "分" : ""}`;
  }
}

export function formatDistanceToNow(date: Date): string {
  return formatDistanceToNowBase(date, { addSuffix: true, locale: zhCN });
}

/** Format an elapsed duration in milliseconds as "X秒" / "X分X秒" / "X时X分". */
export function formatElapsed(ms: number | null): string {
  if (ms === null) return "-";

  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}秒`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}分${seconds % 60}秒`;
  return `${Math.floor(seconds / 3600)}时${Math.floor((seconds % 3600) / 60)}分`;
}

/** Format the duration between two ISO timestamps as "X秒" / "X分X秒" / "X时X分". */
export function formatDurationRange(
  start: string,
  end: string | null,
): string {
  if (!end) return "-";
  return formatElapsed(
    new Date(end).getTime() - new Date(start).getTime(),
  );
}

/** Whether a completed-at timestamp falls within the last 7 days. */
export function isWithin7Days(completedAt: string | null): boolean {
  if (!completedAt) return false;
  const completedDate = new Date(completedAt);
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  return completedDate >= sevenDaysAgo;
}

export function formatCompactNumber(num: number): string {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + "M";
  if (num >= 1000) return (num / 1000).toFixed(1) + "K";
  return num.toString();
}
