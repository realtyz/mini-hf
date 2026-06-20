import { useState, useMemo } from "react";
import type { RepoScanItem, ScanCategory, ScanResultData } from "@/lib/api/types";

export type SortField = "cached_size" | "last_downloaded_at" | "cache_updated_at";
export type SortDirection = "asc" | "desc";

interface UseCacheScanFiltersReturn {
  search: string;
  setSearch: (v: string) => void;
  typeFilter: string;
  setTypeFilter: (v: string) => void;
  categoryFilter: "all" | ScanCategory;
  setCategoryFilter: (v: "all" | ScanCategory) => void;
  thresholdDays: number;
  setThresholdDays: (v: number) => void;
  customDays: string;
  setCustomDays: (v: string) => void;
  actualThreshold: number;
  sortField: SortField | null;
  sortDirection: SortDirection;
  setSort: (field: SortField) => void;
  filteredRepos: RepoScanItem[];
}

function nullsLastCompare(a: unknown, b: unknown, direction: SortDirection): number {
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
  const [thresholdDays, setThresholdDays] = useState(15);
  const [customDays, setCustomDays] = useState("");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<"all" | ScanCategory>("all");
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const setSort = (field: SortField) => {
    setSortField((prev) => {
      if (prev === field) {
        setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
        return field;
      }
      setSortDirection("desc");
      return field;
    });
  };

  const actualThreshold = useMemo(() => {
    if (customDays && Number(customDays) > 0) return Number(customDays);
    return thresholdDays;
  }, [thresholdDays, customDays]);

  const filteredRepos = useMemo(() => {
    if (!result) return [];
    let repos = [...result.repos];
    const q = search.trim().toLowerCase();
    if (q) {
      repos = repos.filter(
        (r) =>
          r.repo_id.toLowerCase().includes(q) ||
          (r.pipeline_tag && r.pipeline_tag.toLowerCase().includes(q)),
      );
    }
    if (typeFilter !== "all") {
      repos = repos.filter((r) => r.repo_type === typeFilter);
    }
    if (categoryFilter !== "all") {
      repos = repos.filter((r) => r.category === categoryFilter);
    }
    if (sortField) {
      repos.sort((a, b) =>
        nullsLastCompare(a[sortField], b[sortField], sortDirection),
      );
    }
    return repos;
  }, [result, search, typeFilter, categoryFilter, sortField, sortDirection]);

  return {
    search,
    setSearch,
    typeFilter,
    setTypeFilter,
    categoryFilter,
    setCategoryFilter,
    thresholdDays,
    setThresholdDays,
    customDays,
    setCustomDays,
    actualThreshold,
    sortField,
    sortDirection,
    setSort,
    filteredRepos,
  };
}
