import { useState } from "react";
import {
  Loader2,
  Check,
  CheckCircle2,
  ArrowLeft,
  ArrowRight,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useTaskActions } from "@/hooks/use-task-actions";
import { useAsyncPreviewTask } from "@/hooks/use-async-preview-task";
import { usePublicHFEndpoints } from "@/hooks/api/use-config-queries";
import type { RepoSource, RepoType } from "@/lib/api/types";
import { AnimatePresence } from "framer-motion";
import { PreviewFormStep } from "./CreateTaskDialog/PreviewFormStep";
import { PreviewLoadingState } from "./CreateTaskDialog/PreviewLoadingState";
import { PreviewErrorState } from "./CreateTaskDialog/PreviewErrorState";
import { PreviewResultStep } from "./CreateTaskDialog/PreviewResultStep";

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
}

export function CreateTaskDialog({
  open,
  onOpenChange,
}: CreateTaskDialogProps) {
  const [step, setStep] = useState<Step>("form");
  const [formData, setFormData] = useState<FormData>({
    source: "huggingface",
    repo_type: "model",
    hf_endpoint: "",
    repo_id: "",
    revision: "main",
    access_token: "",
  });

  const { createTask } = useTaskActions();
  const { data: hfEndpointConfig } = usePublicHFEndpoints();
  const previewTask = useAsyncPreviewTask({
    pollInterval: 1000,
    maxPolls: 300,
  });
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());

  const handlePreview = () => {
    if (!formData.repo_id.trim()) return;
    setStep("previewing");
    previewTask.startPreview({
      source: formData.source,
      repo_type: formData.repo_type,
      repo_id: formData.repo_id.trim(),
      revision: formData.revision || "main",
      hf_endpoint: formData.hf_endpoint || undefined,
      access_token: formData.access_token || undefined,
      full_download: true,
    });
  };

  const handleCreate = () => {
    if (!previewTask.data?.cache_key) return;
    setStep("creating");
    createTask.mutate(
      {
        cacheKey: previewTask.data.cache_key,
        selectedFiles: [...selectedFiles],
      },
      {
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
      },
    );
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
    });
    setSelectedFiles(new Set());
    previewTask.reset();
    createTask.reset();
    onOpenChange(false);
  };

  const previewError = previewTask.isError
    ? (previewTask.error as { message?: string } | null)?.message ||
      "预览失败，请检查仓库信息"
    : null;

  const createError = createTask.isError
    ? (createTask.error as { message?: string } | null)?.message ||
      "创建任务失败"
    : null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="min-w-3xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
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

        <div className="flex-1 min-h-0 overflow-hidden">
          <AnimatePresence mode="wait">
            {step === "previewing" &&
            !previewTask.isSuccess &&
            !previewTask.isError ? (
              <PreviewLoadingState status={previewTask.status ?? "pending"} />
            ) : step === "previewing" && previewTask.isError ? (
              <PreviewErrorState message={previewError ?? ""} />
            ) : step === "form" ? (
              <PreviewFormStep
                formData={formData}
                onFormDataChange={setFormData}
                hfEndpoints={hfEndpointConfig?.data?.endpoints ?? []}
                defaultEndpoint={hfEndpointConfig?.data?.default_endpoint ?? ""}
                previewError={previewError}
              />
            ) : previewTask.data ? (
              <PreviewResultStep
                previewData={previewTask.data}
                selectedFiles={selectedFiles}
                onSelectionChange={setSelectedFiles}
                createError={createError}
              />
            ) : null}
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
                disabled={
                  createTask.isPending ||
                  step === "creating" ||
                  previewTask.data?.all_required_cached ||
                  selectedFiles.size === 0
                }
                className="gap-1"
              >
                {createTask.isPending || step === "creating" ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    创建中...
                  </>
                ) : previewTask.data?.all_required_cached ? (
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