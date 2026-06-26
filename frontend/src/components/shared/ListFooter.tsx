import type { ReactNode } from "react";
import { Pager } from "@/components/shared/Pager";
import { cn } from "@/lib/utils";

interface ListFooterProps {
  currentPage: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  /** Trailing label after the total, e.g. "个仓库" / "条" / "个用户". */
  itemLabel?: string;
  /** Optional trailing node, e.g. a "（筛选中）" hint. */
  note?: ReactNode;
  className?: string;
}

/**
 * Unified list footer: range summary on the left, page navigation on the right.
 * Replaces per-page hand-rolled footers so all list pages share one style.
 */
export function ListFooter({
  currentPage,
  totalPages,
  total,
  pageSize,
  onPageChange,
  itemLabel = "条",
  note,
  className,
}: ListFooterProps) {
  const start = total === 0 ? 0 : Math.min((currentPage - 1) * pageSize + 1, total);
  const end = Math.min(currentPage * pageSize, total);

  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-3", className)}>
      <p className="text-[13px] text-muted-foreground/60 tabular-nums">
        <span className="font-medium text-foreground/80">
          {start.toLocaleString()}–{end.toLocaleString()}
        </span>
        <span className="mx-1 text-muted-foreground/40">/</span>
        <span className="font-medium text-foreground/80">{total.toLocaleString()}</span>
        <span className="ml-1">{itemLabel}</span>
        {note}
      </p>
      {totalPages > 1 && (
        <Pager
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={onPageChange}
          className="mx-0 w-auto"
        />
      )}
    </div>
  );
}
