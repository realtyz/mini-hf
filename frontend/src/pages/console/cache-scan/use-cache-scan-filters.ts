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

interface UseCacheScanFiltersReturn {
  search: string;
  setSearch: (v: string) => void;
  categoryFilter: "all" | ScanCategory;
  setCategoryFilter: (v: "all" | ScanCategory) => void;
  sourceFilter: SourceFilter;
  setSourceFilter: (v: SourceFilter) => void;
  sortField: SortField | null;
  sortDirection: SortDirection;
  setSort: (field: SortField) => void;
  filteredRepos: RepoScanItem[];
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
    if (sortField) {
      repos.sort((a, b) =>
        nullsLastCompare(a[sortField], b[sortField], sortDirection),
      );
    }
    return repos;
  }, [result, deferredSearch, categoryFilter, sourceFilter, sortField, sortDirection]);

  return {
    search,
    setSearch,
    categoryFilter,
    setCategoryFilter,
    sourceFilter,
    setSourceFilter,
    sortField,
    sortDirection,
    setSort,
    filteredRepos,
  };
}
