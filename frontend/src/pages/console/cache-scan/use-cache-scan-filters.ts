import { useState, useMemo } from "react";
import type { RepoScanItem, ScanCategory, ScanResultResponse } from "@/lib/api/types";

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
  filteredRepos: RepoScanItem[];
}

export function useCacheScanFilters(
  result: ScanResultResponse | null,
): UseCacheScanFiltersReturn {
  const [thresholdDays, setThresholdDays] = useState(15);
  const [customDays, setCustomDays] = useState("");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<"all" | ScanCategory>("all");

  const actualThreshold = useMemo(() => {
    if (customDays && Number(customDays) > 0) return Number(customDays);
    return thresholdDays;
  }, [thresholdDays, customDays]);

  const filteredRepos = useMemo(() => {
    if (!result) return [];
    let repos = result.repos;
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
    return repos;
  }, [result, search, typeFilter, categoryFilter]);

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
    filteredRepos,
  };
}
