import { motion, AnimatePresence } from "framer-motion";
import { itemVariants } from "@/lib/animations/motion-config";
import {
  ScanSearch,
  RefreshCw,
  Search,
  X,
  Filter,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import type { ScanCategory } from "@/lib/api/types";

const THRESHOLD_PRESETS = [30, 60, 90, 180];

interface CacheScanToolbarProps {
  isAdmin: boolean;
  isPending: boolean;
  thresholdDays: number;
  setThresholdDays: (v: number) => void;
  customDays: string;
  setCustomDays: (v: string) => void;
  actualThreshold: number;
  onTrigger: () => void;
  onRefresh: () => void;
  typeFilter: string;
  setTypeFilter: (v: string) => void;
  categoryFilter: "all" | ScanCategory;
  setCategoryFilter: (v: "all" | ScanCategory) => void;
  search: string;
  setSearch: (v: string) => void;
  filteredCount: number;
  totalCount: number;
}

export function CacheScanToolbar({
  isAdmin,
  isPending,
  thresholdDays,
  setThresholdDays,
  customDays,
  setCustomDays,
  actualThreshold,
  onTrigger,
  onRefresh,
  typeFilter,
  setTypeFilter,
  categoryFilter,
  setCategoryFilter,
  search,
  setSearch,
  filteredCount,
  totalCount,
}: CacheScanToolbarProps) {
  return (
    <>
      {/* Header */}
      <motion.div
        variants={itemVariants}
        className="flex items-center justify-between"
      >
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-xl bg-primary/5 border border-primary/10 flex items-center justify-center">
            <ScanSearch className="size-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">缓存扫描</h1>
            <p className="text-[13px] text-muted-foreground mt-0.5">
              检测冷数据仓库和孤儿存储，优化存储空间
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isAdmin && (
            <>
              <ToggleGroup
                type="single"
                value={customDays ? "" : String(thresholdDays)}
                onValueChange={(v) => {
                  if (v) {
                    setCustomDays("");
                    setThresholdDays(Number(v));
                  }
                }}
                variant="outline"
                size="sm"
                spacing={0}
              >
                {THRESHOLD_PRESETS.map((d) => (
                  <ToggleGroupItem
                    key={d}
                    value={String(d)}
                    className="h-8 px-2.5 text-[12px]"
                  >
                    {d}天
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              <Input
                type="number"
                min={1}
                max={365}
                placeholder="自定义"
                value={customDays}
                onChange={(e) => setCustomDays(e.target.value)}
                className="w-18 h-8 text-[12px]"
              />
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                    <Button
                      variant="default"
                      size="sm"
                      disabled={isPending}
                      className="gap-2 cursor-pointer text-[13px] h-8"
                    >
                      <RefreshCw
                        className={cn("size-3.5", isPending && "animate-spin")}
                      />
                      {isPending ? "扫描中..." : "触发扫描"}
                    </Button>
                  </motion.div>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>确认触发扫描</AlertDialogTitle>
                    <AlertDialogDescription>
                      使用{" "}
                      <span className="font-semibold text-foreground">
                        {actualThreshold} 天
                      </span>{" "}
                      作为冷数据阈值进行全量扫描，同时检测孤儿存储。此操作可能需要几分钟。
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
          <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
            <Button
              variant="outline"
              size="sm"
              onClick={onRefresh}
              className="gap-2 w-24 cursor-pointer text-[13px] h-8"
            >
              <RefreshCw className="size-3.5" />
              刷新
            </Button>
          </motion.div>
        </div>
      </motion.div>

      {/* Filter Bar */}
      <motion.div
        className="rounded-xl border bg-card p-4"
        variants={itemVariants}
        whileHover={{
          boxShadow: "0 4px 20px -4px rgba(0, 0, 0, 0.08)",
        }}
        transition={{ duration: 0.2 }}
      >
        <div className="flex flex-wrap items-center gap-3">
          <motion.div whileHover={{ scale: 1.01 }} className="relative">
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-36 h-9">
                <div className="flex items-center gap-2">
                  <Filter className="size-3.5 text-muted-foreground" />
                  <SelectValue placeholder="类型" />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部类型</SelectItem>
                <SelectItem value="model">模型</SelectItem>
                <SelectItem value="dataset">数据集</SelectItem>
              </SelectContent>
            </Select>
          </motion.div>

          <ToggleGroup
            type="single"
            value={categoryFilter}
            onValueChange={(v) => {
              if (v) setCategoryFilter(v as "all" | ScanCategory);
            }}
            variant="outline"
            size="sm"
            spacing={0}
          >
            <ToggleGroupItem value="all" className="h-8 px-2.5 text-[12px]">
              全部
            </ToggleGroupItem>
            <ToggleGroupItem value="cold" className="h-8 px-2.5 text-[12px]">
              冷仓库
            </ToggleGroupItem>
            <ToggleGroupItem value="orphan" className="h-8 px-2.5 text-[12px]">
              孤儿
            </ToggleGroupItem>
          </ToggleGroup>

          <div className="relative flex-1 min-w-50 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
            <Input
              type="search"
              placeholder="搜索仓库 ID 或标签..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9 transition-all duration-200 focus:ring-2 focus:ring-primary/20"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={`${filteredCount}-${totalCount}`}
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              className="ml-auto text-sm text-muted-foreground"
            >
              共{" "}
              <span className="font-medium text-foreground">
                {(filteredCount).toLocaleString()}
              </span>{" "}
              个仓库
              {filteredCount !== totalCount && (
                <>
                  {" "}
                  /{" "}
                  <span className="font-medium text-foreground">
                    {(totalCount).toLocaleString()}
                  </span>
                </>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </motion.div>
    </>
  );
}
