import { useState } from "react";
import { Loader2, Check, AlertCircle, ArrowLeft, ArrowRight, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { TagInput } from "@/components/ui/tag-input";
import { useAsyncPreviewTask, useTaskActions } from "@/hooks/useTaskActions";
import { usePublicHFEndpoints } from "@/hooks/api/use-config-queries";
import { formatBytes } from "@/lib/utils";
import type { RepoSource, RepoType } from "@/lib/api-types";
import { PreviewFileTree } from "./PreviewFileTree";
import { motion, AnimatePresence } from "framer-motion";

interface CreateTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Step = "form" | "previewing" | "preview" | "creating";

interface FormData {
  source: RepoSource;
  repo_type: RepoType;
  hf_endpoint: string;
  repo_id: string;
  revision: string;
  access_token: string;
  full_download: boolean;
  allow_patterns: string[];
  ignore_patterns: string[];
}

// Animation variants
const contentVariants = {
  initial: { opacity: 0, x: 20 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -20 },
};

export function CreateTaskDialog({ open, onOpenChange }: CreateTaskDialogProps) {
  const [step, setStep] = useState<Step>("form");
  const [formData, setFormData] = useState<FormData>({
    source: "huggingface",
    repo_type: "model",
    hf_endpoint: "",
    repo_id: "",
    revision: "main",
    access_token: "",
    full_download: true,
    allow_patterns: [],
    ignore_patterns: [],
  });

  const { createTask } = useTaskActions();
  const { data: hfEndpointConfig } = usePublicHFEndpoints();
  const previewTask = useAsyncPreviewTask({ pollInterval: 1000, maxPolls: 300 });
  const [validationError, setValidationError] = useState<string | null>(null);

  // Pattern validation function for glob patterns
  const validatePattern = (pattern: string) => {
    if (!pattern.trim()) {
      return { valid: false, message: "Pattern 不能为空" };
    }
    if (pattern.includes("***") || /\*{3,}/.test(pattern)) {
      return { valid: false, message: "Pattern 包含无效的通配符序列" };
    }
    if (pattern.startsWith("/") || pattern.endsWith("/")) {
      return { valid: false, message: "Pattern 不应以 / 开头或结尾" };
    }
    if (pattern.includes("..")) {
      return { valid: false, message: "Pattern 不能包含目录遍历符 .." };
    }
    return { valid: true };
  };

  const handlePreview = () => {
    if (!formData.repo_id.trim()) return;

    // Validation: if not full download, must provide at least one pattern
    if (!formData.full_download) {
      const hasAllowPatterns = formData.allow_patterns.length > 0;
      const hasIgnorePatterns = formData.ignore_patterns.length > 0;
      if (!hasAllowPatterns && !hasIgnorePatterns) {
        setValidationError("非全量下载时，必须提供 allow_patterns 或 ignore_patterns 至少一个");
        return;
      }
    }

    setValidationError(null);
    setStep("previewing");

    previewTask.startPreview({
      source: formData.source,
      repo_type: formData.repo_type,
      repo_id: formData.repo_id.trim(),
      revision: formData.revision || "main",
      hf_endpoint: formData.hf_endpoint || undefined,
      access_token: formData.access_token || undefined,
      full_download: formData.full_download,
      allow_patterns: formData.allow_patterns.length > 0 ? formData.allow_patterns : undefined,
      ignore_patterns: formData.ignore_patterns.length > 0 ? formData.ignore_patterns : undefined,
    });
  };

  const handleCreate = () => {
    if (!previewTask.data?.cache_key) return;

    setStep("creating");
    createTask.mutate(previewTask.data.cache_key, {
      onSuccess: () => {
        toast.success("任务创建成功", {
          description: `仓库 ${formData.repo_id} 的下载任务已提交`,
        });
        handleClose();
      },
      onError: (error) => {
        toast.error("任务创建失败", {
          description: error instanceof Error ? error.message : "请稍后重试",
        });
        setStep("preview");
      },
    });
  };

  const handleClose = () => {
    setStep("form");
    setFormData({
      source: "huggingface",
      repo_type: "model",
      hf_endpoint: "",
      repo_id: "",
      revision: "main",
      access_token: "",
      full_download: true,
      allow_patterns: [],
      ignore_patterns: [],
    });
    setValidationError(null);
    previewTask.reset();
    createTask.reset();
    onOpenChange(false);
  };

  const previewData = previewTask.data;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="min-w-3xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
        {/* Header */}
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <DialogTitle className="text-lg">新建下载任务</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground mt-1">
            {step === "form"
              ? "填写仓库信息，系统将获取文件列表供您预览"
              : step === "previewing" && !previewTask.isSuccess
                ? "正在获取仓库信息..."
                : "确认下载内容后创建任务"}
          </DialogDescription>
        </DialogHeader>

        {/* Content */}
        <div className="flex-1 min-h-0 overflow-hidden">
          <AnimatePresence mode="wait">
            {step === "previewing" && !previewTask.isSuccess && !previewTask.isError ? (
              <motion.div
                key="previewing"
                variants={contentVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={{ duration: 0.3 }}
                className="flex flex-col items-center justify-center py-12 px-6"
              >
                <Loader2 className="size-10 animate-spin text-primary mb-4" />
                <div className="text-center space-y-2">
                  <motion.p
                    key={previewTask.status}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-sm font-medium text-foreground"
                  >
                    {previewTask.status === "pending" && "等待中..."}
                    {previewTask.status === "fetching" && "获取仓库信息..."}
                    {previewTask.status === "processing" && "处理文件中..."}
                    {previewTask.status === "completed" && "完成"}
                    {previewTask.status === "failed" && "失败"}
                  </motion.p>
                </div>
                <p className="text-xs text-muted-foreground mt-4 max-w-sm text-center">
                  正在获取仓库文件列表，大型仓库可能需要一些时间...
                </p>
              </motion.div>
            ) : step === "previewing" && previewTask.isError ? (
              <motion.div
                key="preview-error"
                variants={contentVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={{ duration: 0.3 }}
                className="flex flex-col items-center justify-center py-12 px-6"
              >
                <motion.div
                  initial={{ scale: 0.8 }}
                  animate={{ scale: 1 }}
                  className="w-20 h-20 rounded-full bg-destructive/10 flex items-center justify-center mb-4"
                >
                  <AlertCircle className="w-10 h-10 text-destructive" />
                </motion.div>
                <h3 className="text-lg font-semibold text-destructive mb-2">预览失败</h3>
                <p className="text-sm text-muted-foreground text-center max-w-md">
                  {previewTask.error instanceof Error
                    ? previewTask.error.message
                    : "获取仓库信息失败，请检查仓库ID和配置后重试"}
                </p>
              </motion.div>
            ) : step === "form" ? (
              <motion.div
                key="form"
                variants={contentVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={{ duration: 0.3 }}
                className="h-full"
              >
                <ScrollArea className="h-full">
                  <div className="space-y-5 py-4 px-6">
                    {/* 第一排：来源、类型、Endpoint */}
                    <div className={`grid gap-4 ${formData.source === "huggingface" ? "grid-cols-3" : "grid-cols-2"}`}>
                      <div className="space-y-2">
                        <Label htmlFor="source">仓库来源</Label>
                        <Select value={formData.source} disabled>
                          <SelectTrigger id="source" className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="huggingface">HuggingFace</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="repo_type">类型</Label>
                        <Select
                          value={formData.repo_type}
                          onValueChange={(v) =>
                            setFormData({ ...formData, repo_type: v as RepoType })
                          }
                        >
                          <SelectTrigger id="repo_type" className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="model">模型</SelectItem>
                            <SelectItem value="dataset">数据集</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {formData.source === "huggingface" && (
                        <div className="space-y-2">
                          <Label htmlFor="hf_endpoint">HF Endpoint</Label>
                          <Select
                            value={formData.hf_endpoint || "__default__"}
                            onValueChange={(v) =>
                              setFormData({ ...formData, hf_endpoint: v === "__default__" ? "" : v })
                            }
                          >
                            <SelectTrigger id="hf_endpoint" className="w-full">
                              <SelectValue placeholder="默认" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__default__">使用默认</SelectItem>
                              {hfEndpointConfig?.data?.endpoints?.map((endpoint) => (
                                <SelectItem key={endpoint} value={endpoint}>
                                  {endpoint}
                                  {endpoint === hfEndpointConfig.data.default_endpoint && " (默认)"}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="repo_id">仓库ID</Label>
                      <Input
                        id="repo_id"
                        placeholder="如: bert-base-uncased 或 organization/model-name"
                        value={formData.repo_id}
                        onChange={(e) =>
                          setFormData({ ...formData, repo_id: e.target.value })
                        }
                        className="transition-all duration-200 focus:ring-2 focus:ring-primary/20"
                      />
                      <p className="text-xs text-muted-foreground">
                        HuggingFace 仓库标识符，如: org/model-name
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="revision">版本/分支</Label>
                      <Input
                        id="revision"
                        placeholder="main"
                        value={formData.revision}
                        onChange={(e) =>
                          setFormData({ ...formData, revision: e.target.value })
                        }
                        className="transition-all duration-200 focus:ring-2 focus:ring-primary/20"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="access_token">访问令牌（可选）</Label>
                      <Input
                        id="access_token"
                        type="password"
                        placeholder="私有仓库需要填写"
                        value={formData.access_token}
                        onChange={(e) =>
                          setFormData({ ...formData, access_token: e.target.value })
                        }
                        className="transition-all duration-200 focus:ring-2 focus:ring-primary/20"
                      />
                    </div>

                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="full_download"
                        checked={formData.full_download}
                        onCheckedChange={(checked) => {
                          setValidationError(null);
                          setFormData({ ...formData, full_download: checked as boolean });
                        }}
                      />
                      <Label htmlFor="full_download" className="font-normal cursor-pointer">
                        全量下载（下载所有文件）
                      </Label>
                    </div>

                    <AnimatePresence>
                      {!formData.full_download && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.25 }}
                          className="space-y-4 rounded-lg border border-dashed p-4 bg-muted/30 overflow-hidden"
                        >
                          <p className="text-sm font-medium text-muted-foreground">
                            文件过滤规则（至少填写一项）
                          </p>
                          <TagInput
                            id="allow_patterns"
                            label="允许下载的文件模式（allow_patterns）"
                            value={formData.allow_patterns}
                            onChange={(value) => {
                              setValidationError(null);
                              setFormData({ ...formData, allow_patterns: value });
                            }}
                            validate={validatePattern}
                            placeholder="输入 pattern 后按回车添加，如: *.bin"
                            description="只下载匹配的文件。支持通配符如 *.bin, models/**"
                          />
                          <TagInput
                            id="ignore_patterns"
                            label="忽略的文件模式（ignore_patterns）"
                            value={formData.ignore_patterns}
                            onChange={(value) => {
                              setValidationError(null);
                              setFormData({ ...formData, ignore_patterns: value });
                            }}
                            validate={validatePattern}
                            placeholder="输入 pattern 后按回车添加，如: *.safetensors"
                            description="忽略匹配的文件。优先级低于 allow_patterns"
                          />
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <AnimatePresence>
                      {validationError && (
                        <motion.div
                          initial={{ opacity: 0, y: -10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -10 }}
                        >
                          <Alert variant="destructive">
                            <AlertDescription>{validationError}</AlertDescription>
                          </Alert>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <AnimatePresence>
                      {previewTask.isError && (
                        <motion.div
                          initial={{ opacity: 0, y: -10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -10 }}
                        >
                          <Alert variant="destructive">
                            <AlertDescription>
                              {previewTask.error instanceof Error
                                ? previewTask.error.message
                                : "预览失败，请检查仓库信息"}
                            </AlertDescription>
                          </Alert>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </ScrollArea>
              </motion.div>
            ) : (
              <motion.div
                key="preview"
                variants={contentVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={{ duration: 0.3 }}
                className="h-full flex flex-col"
              >
                {previewData && (
                  <>
                    {/* 所有文件已缓存的提示 */}
                    {previewData.all_required_cached ? (
                      <div className="flex flex-col items-center justify-center py-12 px-6">
                        <motion.div
                          initial={{ scale: 0.8 }}
                          animate={{ scale: 1 }}
                          className="w-20 h-20 rounded-full bg-blue-500/10 flex items-center justify-center mb-4"
                        >
                          <CheckCircle2 className="w-10 h-10 text-blue-500" />
                        </motion.div>
                        <h3 className="text-lg font-semibold text-foreground mb-2">所有文件已缓存</h3>
                        <p className="text-sm text-muted-foreground text-center max-w-md mb-4">
                          仓库 <span className="font-medium text-foreground">{previewData.repo_id}</span> 的所有 {previewData.required_file_count} 个请求文件已在本地缓存中，无需重复下载。
                        </p>
                        {previewData.cached_commit_hash && (
                          <code className="font-mono text-xs bg-muted/60 px-3 py-1.5 rounded text-muted-foreground">
                            Commit: {previewData.cached_commit_hash}
                          </code>
                        )}
                      </div>
                    ) : (
                      <ScrollArea className="flex-1 min-h-0">
                        {/* 主要统计信息卡片 */}
                        <div className="px-6 pt-5 pb-4">
                          <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.1 }}
                            className="relative overflow-hidden rounded-xl bg-linear-to-br from-emerald-500/10 via-emerald-500/5 to-transparent dark:from-emerald-500/20 dark:via-emerald-500/10 border border-emerald-500/20 dark:border-emerald-500/30"
                          >
                            {/* 装饰性背景 */}
                            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
                            <div className="absolute bottom-0 left-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-2xl translate-y-1/2 -translate-x-1/2" />

                            <div className="relative p-5">
                              <div className="flex items-start gap-4">
                                <div className="w-12 h-12 rounded-xl bg-emerald-500/20 dark:bg-emerald-500/30 flex items-center justify-center shrink-0">
                                  <Check className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <h3 className="text-base font-semibold text-emerald-900 dark:text-emerald-100 mb-1">
                                    预览完成
                                  </h3>
                                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-emerald-700 dark:text-emerald-300">
                                    <span className="flex items-center gap-1.5">
                                      <span className="font-medium">{previewData.required_file_count}</span>
                                      <span className="text-emerald-600/70 dark:text-emerald-400/70">个文件待下载</span>
                                    </span>
                                    <span className="text-emerald-400 dark:text-emerald-500">·</span>
                                    <span className="flex items-center gap-1.5">
                                      <span className="font-medium">{formatBytes(previewData.required_storage)}</span>
                                      <span className="text-emerald-600/70 dark:text-emerald-400/70">所需空间</span>
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </motion.div>
                        </div>

                        {/* 仓库详细信息 */}
                        <div className="px-6 pb-4">
                          <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.15 }}
                          >
                            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
                              仓库信息
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <div className="group relative p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                                <div className="text-xs text-muted-foreground mb-1">仓库</div>
                                <p className="font-medium text-sm truncate">{previewData.repo_id}</p>
                              </div>
                              <div className="group relative p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                                <div className="text-xs text-muted-foreground mb-1">版本</div>
                                <p className="font-mono text-sm">{previewData.revision}</p>
                              </div>
                              <div className="group relative p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                                <div className="text-xs text-muted-foreground mb-1">文件数</div>
                                <p className="text-sm">
                                  <span className="font-medium text-primary">{previewData.required_file_count}</span>
                                  <span className="text-muted-foreground"> / {previewData.total_file_count}</span>
                                </p>
                              </div>
                              <div className="group relative p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                                <div className="text-xs text-muted-foreground mb-1">大小</div>
                                <p className="text-sm">
                                  <span className="font-medium text-primary">{formatBytes(previewData.required_storage)}</span>
                                  <span className="text-muted-foreground"> / {formatBytes(previewData.total_storage)}</span>
                                </p>
                              </div>
                            </div>
                          </motion.div>
                        </div>

                        {/* Commit Hash */}
                        {previewData.commit_hash && (
                          <div className="px-6 pb-4">
                            <motion.div
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: 0.2 }}
                              className="flex items-center gap-2 text-xs"
                            >
                              <span className="text-muted-foreground">Commit:</span>
                              <code className="font-mono bg-muted/60 px-2 py-1 rounded text-foreground/80">
                                {previewData.commit_hash}
                              </code>
                            </motion.div>
                          </div>
                        )}

                        {/* 文件树 */}
                        <div className="px-6 pb-5">
                          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
                            文件列表
                          </div>
                          <PreviewFileTree
                            items={previewData.items}
                            repoId={previewData.repo_id}
                          />
                        </div>
                      </ScrollArea>
                    )}

                    <AnimatePresence>
                      {createTask.isError && (
                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 10 }}
                          className="px-6 py-3 border-t"
                        >
                          <Alert variant="destructive">
                            <AlertDescription>
                              {createTask.error instanceof Error
                                ? createTask.error.message
                                : "创建任务失败"}
                            </AlertDescription>
                          </Alert>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer */}
        <DialogFooter className="px-6 py-4 border-t gap-2">
          {step === "form" ? (
            <>
              <Button variant="outline" onClick={handleClose} className="gap-1">
                取消
              </Button>
              <Button
                onClick={handlePreview}
                disabled={!formData.repo_id.trim() || previewTask.isStarting}
                className="gap-1"
              >
                {previewTask.isStarting ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    启动中...
                  </>
                ) : (
                  <>
                    下一步
                    <ArrowRight className="size-4" />
                  </>
                )}
              </Button>
            </>
          ) : step === "previewing" && previewTask.isError ? (
            <>
              <Button
                variant="outline"
                onClick={() => {
                  previewTask.reset();
                  setStep("form");
                }}
                className="gap-1"
              >
                <ArrowLeft className="size-4" />
                返回
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  previewTask.reset();
                  handlePreview();
                }}
                className="gap-1"
              >
                重试
              </Button>
            </>
          ) : step === "previewing" && !previewTask.isSuccess ? (
            <>
              <Button
                variant="outline"
                onClick={() => {
                  previewTask.cancelPreview();
                  setStep("form");
                }}
              >
                取消
              </Button>
              <Button disabled>
                <Loader2 className="mr-2 size-4 animate-spin" />
                获取中...
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={() => setStep("form")}
                disabled={createTask.isPending || step === "creating"}
                className="gap-1"
              >
                <ArrowLeft className="size-4" />
                返回
              </Button>
              <Button
                onClick={handleCreate}
                disabled={createTask.isPending || step === "creating" || previewData?.all_required_cached}
                className="gap-1"
              >
                {createTask.isPending || step === "creating" ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    创建中...
                  </>
                ) : previewData?.all_required_cached ? (
                  <>
                    <CheckCircle2 className="size-4" />
                    已缓存
                  </>
                ) : (
                  <>
                    <Check className="size-4" />
                    确认创建
                  </>
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default CreateTaskDialog;
