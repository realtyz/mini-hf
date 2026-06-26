import { motion } from "framer-motion";
import { AnimatePresence } from "framer-motion";
import { ScrollArea } from "@/components/ui/scroll-area";
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
import type { RepoSource, RepoType } from "@/lib/api/types";

interface FormData {
  source: RepoSource;
  repo_type: RepoType;
  hf_endpoint: string;
  repo_id: string;
  revision: string;
  access_token: string;
}

interface PreviewFormStepProps {
  formData: FormData;
  onFormDataChange: (data: FormData) => void;
  hfEndpoints: string[];
  defaultEndpoint: string;
  previewError: string | null;
}

const contentVariants = {
  initial: { opacity: 0, x: 20 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -20 },
};

export function PreviewFormStep({
  formData,
  onFormDataChange,
  hfEndpoints,
  defaultEndpoint,
  previewError,
}: PreviewFormStepProps) {
  return (
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
          <div
            className={`grid gap-4 ${formData.source === "huggingface" ? "grid-cols-3" : "grid-cols-2"}`}
          >
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
                  onFormDataChange({ ...formData, repo_type: v as RepoType })
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
                    onFormDataChange({
                      ...formData,
                      hf_endpoint: v === "__default__" ? "" : v,
                    })
                  }
                >
                  <SelectTrigger id="hf_endpoint" className="w-full">
                    <SelectValue placeholder="默认" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__default__">使用默认</SelectItem>
                    {hfEndpoints.map((endpoint) => (
                      <SelectItem key={endpoint} value={endpoint}>
                        {endpoint}
                        {endpoint === defaultEndpoint && " (默认)"}
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
                onFormDataChange({ ...formData, repo_id: e.target.value })
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
                onFormDataChange({ ...formData, revision: e.target.value })
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
                onFormDataChange({ ...formData, access_token: e.target.value })
              }
              className="transition-all duration-200 focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <AnimatePresence>
            {previewError && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                <Alert variant="destructive">
                  <AlertDescription>{previewError}</AlertDescription>
                </Alert>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </ScrollArea>
    </motion.div>
  );
}
