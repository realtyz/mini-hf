import { useState, useMemo, useDeferredValue } from "react";
import type {
  RepoScanItem,
  RepoSource,
  ScanCategory,
  ScanResultData,
} from "@/lib/api/types";

export type SortField =
  | "cached_size"
  | "last_downloaded_at"
  | "cache_updated_at"
  | "downloads";
export type SortDirection = "asc" | "desc";
export type SourceFilter = "all" | RepoSource;
export type TimeFilterField = "last_downloaded_at" | "cache_updated_at";

/**
 * Time filter state. `dateRange` holds an absolute date range (either bound
 * may be null = open-ended). `includeNever` additionally admits repos whose
 * timestamp is null (never downloaded / never updated).
 *
 * When both `from` and `to` are null *and* `includeNever` is false, the time
 * filter is inactive ("all time").
 */
export interface TimeFilterState {
  field: TimeFilterField;
  dateRange: { from: Date | undefined; to: Date | undefined };
  includeNever: boolean;
}

/** Default (inactive) time filter - shows everything. */
export const DEFAULT_TIME_FILTER: TimeFilterState = {
  field: "last_downloaded_at",
  dateRange: { from: undefined, to: undefined },
  includeNever: false,
};

interface UseCacheScanFiltersReturn {
  search: string;
  setSearch: (v: string) => void;
  categoryFilter: "all" | ScanCategory;
  setCategoryFilter: (v: "all" | ScanCategory) => void;
  sourceFilter: SourceFilter;
  setSourceFilter: (v: SourceFilter) => void;
  timeFilter: TimeFilterState;
  setTimeFilter: (v: TimeFilterState) => void;
  sortField: SortField | null;
  sortDirection: SortDirection;
  setSort: (field: SortField) => void;
  filteredRepos: RepoScanItem[];
  /** Count of currently-active filter dimensions (for the trigger badge). */
  activeFilterCount: number;
}

function nullsLastCompare(
  a: unknown,
  b: unknown,
  direction: SortDirection,
): number {
  const aNull = a === null || a === undefined;
  const bNull = b === null || b === undefined;
  if (aNull && bNull) return 0;
  if (aNull) return 1;
  if (bNull) return -1;
  const mul = direction === "asc" ? 1 : -1;
  if (typeof a === "number" && typeof b === "number") return (a - b) * mul;
  return String(a).localeCompare(String(b)) * mul;
}

/**
 * True if *ts* (ISO string) falls inside the given [from, to] range, where
 * either bound may be null (open-ended). Bound comparisons are inclusive
 * after truncating to the start of the day.
 */
function isWithinRange(
  ts: string,
  range: { from: Date | undefined; to: Date | undefined },
): boolean {
  const t = new Date(ts).getTime();
  if (range.from && t < range.from.getTime()) return false;
  // `to` is inclusive of the whole day: bump to end-of-day.
  if (range.to) {
    const endOfDay = range.to.getTime() + 86_400_000 - 1;
    if (t > endOfDay) return false;
  }
  return true;
}

export function useCacheScanFilters(
  result: ScanResultData | null,
): UseCacheScanFiltersReturn {
  const [search, setSearch] = useState("");
  // Defer the search value used for filtering so the input stays responsive
  // while the (potentially expensive) full-array filter + sort runs at a
  // lower priority. Avoids re-rendering the whole table on every keystroke.
  const deferredSearch = useDeferredValue(search);
  const [categoryFilter, setCategoryFilter] = useState<"all" | ScanCategory>(
    "all",
  );
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [timeFilter, setTimeFilter] = useState<TimeFilterState>(
    DEFAULT_TIME_FILTER,
  );
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const setSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  };

  // Whether the time filter imposes any constraint. When inactive it is
  // skipped entirely (avoids touching repos whose timestamp is null).
  const timeFilterActive =
    timeFilter.dateRange.from != null ||
    timeFilter.dateRange.to != null ||
    timeFilter.includeNever;

  const filteredRepos = useMemo(() => {
    if (!result) return [];
    let repos = [...result.repos];
    const q = deferredSearch.trim().toLowerCase();
    if (q) {
      repos = repos.filter(
        (r) =>
          r.repo_id.toLowerCase().includes(q) ||
          (r.pipeline_tag && r.pipeline_tag.toLowerCase().includes(q)),
      );
    }
    if (categoryFilter !== "all") {
      repos = repos.filter((r) => r.category === categoryFilter);
    }
    if (sourceFilter !== "all") {
      repos = repos.filter((r) => r.source === sourceFilter);
    }
    if (timeFilterActive) {
      const { field, dateRange, includeNever } = timeFilter;
      const rangeActive = dateRange.from != null || dateRange.to != null;
      repos = repos.filter((r) => {
        const ts = r[field];
        if (ts === null) return includeNever;
        return rangeActive ? isWithinRange(ts, dateRange) : false;
      });
    }
    if (sortField) {
      repos.sort((a, b) =>
        nullsLastCompare(a[sortField], b[sortField], sortDirection),
      );
    }
    return repos;
  }, [
    result,
    deferredSearch,
    categoryFilter,
    sourceFilter,
    timeFilter,
    timeFilterActive,
    sortField,
    sortDirection,
  ]);

  const activeFilterCount =
    (categoryFilter !== "all" ? 1 : 0) +
    (sourceFilter !== "all" ? 1 : 0) +
    (timeFilterActive ? 1 : 0);

  return {
    search,
    setSearch,
    categoryFilter,
    setCategoryFilter,
    sourceFilter,
    setSourceFilter,
    timeFilter,
    setTimeFilter,
    sortField,
    sortDirection,
    setSort,
    filteredRepos,
    activeFilterCount,
  };
}
