import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { itemVariants } from "@/lib/animations/motion-config";
import {
  ScanSearch,
  RefreshCw,
  Search,
  X,
  Trash2,
  Zap,
  SlidersHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/shared/PageHeader";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { formatDate } from "date-fns";
import type { DateRange } from "react-day-picker";
import { STRINGS } from "@/lib/constants/strings";
import type { ScanCategory } from "@/lib/api/types";
import type {
  SourceFilter,
  TimeFilterField,
  TimeFilterState,
} from "./use-cache-scan-filters";
import { DEFAULT_TIME_FILTER } from "./use-cache-scan-filters";

interface CacheScanToolbarProps {
  isAdmin: boolean;
  isPending: boolean;
  onTrigger: () => void;
  onRefresh: () => void;
  categoryFilter: "all" | ScanCategory;
  setCategoryFilter: (v: "all" | ScanCategory) => void;
  sourceFilter: SourceFilter;
  setSourceFilter: (v: SourceFilter) => void;
  timeFilter: TimeFilterState;
  setTimeFilter: (v: TimeFilterState) => void;
  search: string;
  setSearch: (v: string) => void;
  filteredCount: number;
  totalCount: number;
  selectedCount: number;
  activeFilterCount: number;
  onClearAll: () => void;
  onBatchDelete: () => void;
  isBatchDeleting: boolean;
}

// =============================================================================
// Segmented single-select control - matches the visual language of the
// previous inline toggle groups but is compact enough for a popover row.
// =============================================================================
interface SegmentedProps<T extends string> {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: SegmentedProps<T>) {
  return (
    <div className="flex items-center rounded-xl border border-border/60 bg-muted/30 p-1 gap-0.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            "px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all duration-200 cursor-pointer",
            value === opt.value
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// =============================================================================
// Popover content - edits a *draft* copy of the filter state and commits it
// back on "apply". Drafting avoids re-filtering the table on every date hover
// / click, which would cause flicker.
// =============================================================================
interface FilterPopoverContentProps {
  categoryFilter: "all" | ScanCategory;
  sourceFilter: SourceFilter;
  timeFilter: TimeFilterState;
  onApply: (next: {
    category: "all" | ScanCategory;
    source: SourceFilter;
    time: TimeFilterState;
  }) => void;
  onClear: () => void;
}

function FilterPopoverContent({
  categoryFilter,
  sourceFilter,
  timeFilter,
  onApply,
  onClear,
}: FilterPopoverContentProps) {
  const [draftCategory, setDraftCategory] = useState(categoryFilter);
  const [draftSource, setDraftSource] = useState(sourceFilter);
  const [draftTime, setDraftTime] = useState<TimeFilterState>(timeFilter);
  // NOTE: This component is remounted (via a `key` on the parent) each time
  // the popover opens, so these initializers always see fresh props. A
  // sync `useEffect` to re-sync the draft would trigger cascading renders
  // and is flagged by react-hooks/set-state-in-effect.

  const rangeActive =
    draftTime.dateRange.from !== null || draftTime.dateRange.to !== null;

  const handleRangeSelect = (selected: DateRange | undefined) => {
    setDraftTime((prev) => ({
      ...prev,
      dateRange: {
        from: selected?.from ?? null,
        to: selected?.to ?? null,
      },
    }));
  };

  return (
    <div className="w-full space-y-4">
      {/* Category */}
      <div className="space-y-1.5">
        <p className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground/60">
          {STRINGS.cacheScanFilterCategory}
        </p>
        <Segmented
          value={draftCategory}
          onChange={setDraftCategory}
          options={[
            { value: "all", label: STRINGS.cacheScanFilterAll },
            { value: "tracked", label: STRINGS.cacheScanFilterTracked },
            { value: "untracked", label: STRINGS.cacheScanFilterUntracked },
          ]}
        />
      </div>

      {/* Source */}
      <div className="space-y-1.5">
        <p className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground/60">
          {STRINGS.cacheScanFilterSource}
        </p>
        <Segmented
          value={draftSource}
          onChange={setDraftSource}
          options={[
            { value: "all", label: STRINGS.cacheScanFilterAllSources },
            { value: "huggingface", label: "HuggingFace" },
            { value: "modelscope", label: "ModelScope" },
          ]}
        />
      </div>

      {/* Time field */}
      <div className="space-y-1.5">
        <p className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground/60">
          {STRINGS.cacheScanFilterField}
        </p>
        <Select
          value={draftTime.field}
          onValueChange={(v) =>
            setDraftTime((prev) => ({ ...prev, field: v as TimeFilterField }))
          }
        >
          <SelectTrigger className="w-full h-9 rounded-xl border-border/60 text-[13px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="last_downloaded_at">
              {STRINGS.cacheScanFilterLastDownloaded}
            </SelectItem>
            <SelectItem value="cache_updated_at">
              {STRINGS.cacheScanFilterCacheUpdated}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Date range */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground/60">
            {STRINGS.cacheScanFilterTime}
          </p>
          {rangeActive && (
            <button
              type="button"
              onClick={() =>
                setDraftTime((prev) => ({
                  ...prev,
                  dateRange: { from: null, to: null },
                }))
              }
              className="text-[11px] text-muted-foreground/60 hover:text-foreground transition-colors cursor-pointer"
            >
              {STRINGS.cacheScanFilterClear}
            </button>
          )}
        </div>
        <div className="flex justify-center overflow-hidden rounded-xl border border-border/60 bg-background p-1">
          <Calendar
            mode="range"
            selected={draftTime.dateRange}
            onSelect={handleRangeSelect}
            numberOfMonths={1}
            ISOWeek
            className="mx-auto"
          />
        </div>
        <label className="flex items-center gap-2 pt-0.5 cursor-pointer select-none">
          <Checkbox
            checked={draftTime.includeNever}
            onCheckedChange={(v) =>
              setDraftTime((prev) => ({ ...prev, includeNever: v === true }))
            }
          />
          <span className="text-[12.5px] text-muted-foreground">
            {STRINGS.cacheScanFilterIncludeNever}
          </span>
        </label>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between gap-2 pt-1 border-t border-border/40">
        <Button
          variant="ghost"
          size="sm"
          onClick={onClear}
          className="h-8 text-[12.5px] cursor-pointer rounded-lg"
        >
          {STRINGS.cacheScanFilterClear}
        </Button>
        <Button
          size="sm"
          onClick={() =>
            onApply({
              category: draftCategory,
              source: draftSource,
              time: draftTime,
            })
          }
          className="h-8 text-[12.5px] cursor-pointer rounded-lg"
        >
          {STRINGS.cacheScanFilterApply}
        </Button>
      </div>
    </div>
  );
}

// =============================================================================
// Active filter chips - one per active dimension, each dismissible.
// =============================================================================
interface ActiveFilterChipsProps {
  categoryFilter: "all" | ScanCategory;
  sourceFilter: SourceFilter;
  timeFilter: TimeFilterState;
  timeFilterActive: boolean;
  onClearCategory: () => void;
  onClearSource: () => void;
  onClearTime: () => void;
  onClearAll: () => void;
}

function formatDateChip(d: Date): string {
  return formatDate(d, "yyyy-MM-dd");
}

function ActiveFilterChips({
  categoryFilter,
  sourceFilter,
  timeFilter,
  timeFilterActive,
  onClearCategory,
  onClearSource,
  onClearTime,
  onClearAll,
}: ActiveFilterChipsProps) {
  const chips: { label: string; onClear: () => void }[] = [];

  if (categoryFilter !== "all") {
    chips.push({
      label:
        categoryFilter === "tracked"
          ? STRINGS.cacheScanFilterTracked
          : STRINGS.cacheScanFilterUntracked,
      onClear: onClearCategory,
    });
  }
  if (sourceFilter !== "all") {
    chips.push({
      label: sourceFilter === "huggingface" ? "HuggingFace" : "ModelScope",
      onClear: onClearSource,
    });
  }
  if (timeFilterActive) {
    const { from, to } = timeFilter.dateRange;
    let label: string;
    if (from && to) {
      label = STRINGS.cacheScanFilterDateRange(formatDateChip(from), formatDateChip(to));
    } else if (from) {
      label = STRINGS.cacheScanFilterDateFrom(formatDateChip(from));
    } else if (to) {
      label = STRINGS.cacheScanFilterDateTo(formatDateChip(to));
    } else {
      // Only `includeNever` is set - no date bounds.
      label = STRINGS.cacheScanFilterIncludeNever;
    }
    if (timeFilter.includeNever && (from || to)) {
      label += ` · ${STRINGS.cacheScanFilterIncludeNever}`;
    }
    chips.push({ label, onClear: onClearTime });
  }

  if (chips.length === 0) return null;

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {chips.map((chip, i) => (
        <Badge
          key={i}
          variant="outline"
          className="gap-1 pl-2.5 pr-1 py-1 text-[11.5px] font-medium rounded-lg bg-muted/40 border-border/60"
        >
          {chip.label}
          <button
            type="button"
            onClick={chip.onClear}
            className="size-3.5 flex items-center justify-center rounded-sm text-muted-foreground/60 hover:text-foreground hover:bg-background/80 transition-colors cursor-pointer"
            aria-label="清除该筛选"
          >
            <X className="size-3" />
          </button>
        </Badge>
      ))}
      <button
        type="button"
        onClick={onClearAll}
        className="text-[12px] text-muted-foreground/70 hover:text-foreground transition-colors cursor-pointer ml-1"
      >
        {STRINGS.cacheScanFilterClearAll}
      </button>
    </div>
  );
}

// =============================================================================
// Main toolbar
// =============================================================================
export function CacheScanToolbar({
  isAdmin,
  isPending,
  onTrigger,
  onRefresh,
  categoryFilter,
  setCategoryFilter,
  sourceFilter,
  setSourceFilter,
  timeFilter,
  setTimeFilter,
  search,
  setSearch,
  filteredCount,
  totalCount,
  selectedCount,
  activeFilterCount,
  onClearAll,
  onBatchDelete,
  isBatchDeleting,
}: CacheScanToolbarProps) {
  const timeFilterActive =
    timeFilter.dateRange.from !== null ||
    timeFilter.dateRange.to !== null ||
    timeFilter.includeNever;

  // Popover open state + an open counter. The counter keys the popover
  // content so it remounts each time the popover opens - this lets the
  // draft `useState` initializers pick up the latest props without a sync
  // `useEffect` (which would trigger cascading renders).
  const [filterOpen, setFilterOpen] = useState(false);
  const [openCount, setOpenCount] = useState(0);

  const clearCategory = () => setCategoryFilter("all");
  const clearSource = () => setSourceFilter("all");
  const clearTime = () => setTimeFilter(DEFAULT_TIME_FILTER);

  return (
    <>
      {/* Header - powered by shared PageHeader with actions slot */}
      <motion.div variants={itemVariants}>
        <PageHeader
          icon={ScanSearch}
          title="缓存扫描"
          subtitle="检测已追踪和未追踪仓库，精准掌握缓存空间使用情况"
          actions={
            <>
              {isAdmin && (
                <>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <motion.div
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        <Button
                          variant="default"
                          size="sm"
                          disabled={isPending}
                          className="gap-1.5 cursor-pointer text-[13px] h-9 px-4 rounded-xl font-medium shadow-sm"
                        >
                          {isPending ? (
                            <RefreshCw className="size-3.5 animate-spin" />
                          ) : (
                            <Zap className="size-3.5" />
                          )}
                          {isPending ? "扫描中..." : "触发扫描"}
                        </Button>
                      </motion.div>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>确认触发扫描</AlertDialogTitle>
                        <AlertDialogDescription>
                          对 S3
                          存储进行全量扫描，按仓库归类并标记追踪状态。此操作可能需要几分钟。
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>取消</AlertDialogCancel>
                        <AlertDialogAction onClick={onTrigger}>
                          {isPending ? "扫描中..." : "开始扫描"}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </>
              )}
              {selectedCount > 0 && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <motion.div
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={isBatchDeleting}
                        className="gap-1.5 cursor-pointer text-[13px] h-9 px-4 rounded-xl font-medium border-red-300 text-red-600 hover:bg-red-50 hover:border-red-400 dark:border-red-800/60 dark:text-red-400 dark:hover:bg-red-950/50"
                      >
                        <Trash2 className="size-3.5" />
                        批量删除
                        <span className="tabular-nums ml-0.5">
                          ({selectedCount})
                        </span>
                      </Button>
                    </motion.div>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>确认批量删除仓库</AlertDialogTitle>
                      <AlertDialogDescription>
                        您即将删除{" "}
                        <span className="font-semibold text-foreground">
                          {selectedCount} 个仓库
                        </span>
                        。此操作将删除所有缓存文件、版本数据和数据库记录，所有数据将永久丢失！
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel disabled={isBatchDeleting}>
                        取消
                      </AlertDialogCancel>
                      <AlertDialogAction
                        onClick={onBatchDelete}
                        disabled={isBatchDeleting}
                        className="border border-red-300 bg-transparent text-red-600 hover:bg-red-50 hover:border-red-400 dark:border-red-800/60 dark:text-red-400 dark:hover:bg-red-950/50"
                      >
                        确认删除
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
              <motion.div
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onRefresh}
                  className="gap-1.5 cursor-pointer text-[13px] h-9 px-4 rounded-xl font-medium"
                >
                  <RefreshCw className="size-3.5" />
                  刷新
                </Button>
              </motion.div>
            </>
          }
        />
      </motion.div>

      {/* Filter Bar */}
      <motion.div
        className="relative rounded-2xl border border-border/60 bg-card overflow-hidden"
        variants={itemVariants}
        whileHover={{
          boxShadow: "0 4px 24px -6px rgba(0, 0, 0, 0.06)",
        }}
        transition={{ duration: 0.25 }}
      >
        {/* Subtle top accent line */}
        <div className="absolute top-0 left-4 right-4 h-px bg-linear-to-r from-transparent via-border/40 to-transparent" />

        <div className="flex flex-wrap items-center gap-3 px-5 py-4">
          {/* Filter trigger + popover */}
          <Popover
            open={filterOpen}
            onOpenChange={(o) => {
              setFilterOpen(o);
              if (o) setOpenCount((c) => c + 1);
            }}
          >
            <PopoverTrigger asChild>
              <motion.div
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <Button
                  variant="outline"
                  size="sm"
                  className={cn(
                    "gap-1.5 cursor-pointer text-[13px] h-9 px-4 rounded-xl font-medium",
                    activeFilterCount > 0 &&
                      "border-primary/40 bg-primary/5 text-primary hover:bg-primary/10 hover:border-primary/50",
                  )}
                >
                  <SlidersHorizontal className="size-3.5" />
                  {activeFilterCount > 0
                    ? STRINGS.cacheScanFilterActive(activeFilterCount)
                    : STRINGS.cacheScanFilter}
                  {activeFilterCount > 0 && (
                    <span className="tabular-nums ml-0.5 inline-flex items-center justify-center min-w-4 h-4 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold">
                      {activeFilterCount}
                    </span>
                  )}
                </Button>
              </motion.div>
            </PopoverTrigger>
            <PopoverContent
              align="start"
              sideOffset={8}
              className="w-[20.5rem] rounded-2xl p-4"
            >
              <FilterPopoverContent
                key={openCount}
                categoryFilter={categoryFilter}
                sourceFilter={sourceFilter}
                timeFilter={timeFilter}
                onApply={({ category, source, time }) => {
                  setCategoryFilter(category);
                  setSourceFilter(source);
                  setTimeFilter(time);
                  setFilterOpen(false);
                }}
                onClear={() => {
                  setCategoryFilter("all");
                  setSourceFilter("all");
                  setTimeFilter(DEFAULT_TIME_FILTER);
                }}
              />
            </PopoverContent>
          </Popover>

          {/* Search */}
          <div className="relative flex-1 min-w-50 max-w-sm">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground/50 pointer-events-none" />
            <Input
              type="search"
              placeholder="搜索仓库 ID 或标签..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9.5 h-9 rounded-xl border-border/60 text-[13px] transition-all duration-200 focus:ring-2 focus:ring-primary/15"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground/40 hover:text-foreground transition-colors cursor-pointer"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>

          {/* Count */}
          <AnimatePresence mode="wait">
            <motion.div
              key={`${filteredCount}-${totalCount}`}
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.15 }}
              className="ml-auto flex items-center gap-1.5 text-[13px] text-muted-foreground/60"
            >
              <span className="font-mono font-medium tabular-nums text-foreground/80">
                {filteredCount.toLocaleString()}
              </span>
              个仓库
              {filteredCount !== totalCount && (
                <>
                  <span className="text-muted-foreground/30">/</span>
                  <span className="font-mono tabular-nums text-muted-foreground/40">
                    {totalCount.toLocaleString()}
                  </span>
                </>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Active filter chips row - only rendered when there are chips. */}
        {(categoryFilter !== "all" ||
          sourceFilter !== "all" ||
          timeFilterActive) && (
          <div className="flex items-center gap-2 flex-wrap px-5 pb-4 pt-0 -mt-1">
            <ActiveFilterChips
              categoryFilter={categoryFilter}
              sourceFilter={sourceFilter}
              timeFilter={timeFilter}
              timeFilterActive={timeFilterActive}
              onClearCategory={clearCategory}
              onClearSource={clearSource}
              onClearTime={clearTime}
              onClearAll={onClearAll}
            />
          </div>
        )}
      </motion.div>
    </>
  );
}
