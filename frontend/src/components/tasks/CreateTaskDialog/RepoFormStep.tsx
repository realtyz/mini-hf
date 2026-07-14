import { motion } from "framer-motion";
import { AnimatePresence } from "framer-motion";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { SectionLabel } from "@/components/shared";
import type { RepoSource, RepoType } from "@/lib/api/types";
import { Field } from "./Field";

interface FormData {
  source: RepoSource;
  repo_type: RepoType;
  hf_endpoint: string;
  repo_id: string;
  revision: string;
  access_token: string;
}

interface RepoFormStepProps {
  formData: FormData;
  onFormDataChange: (data: FormData) => void;
  hfEndpoints: string[];
  defaultEndpoint: string;
  defaultMSEndpoint: string;
  previewError: string | null;
}

const contentVariants = {
  initial: { opacity: 0, x: 20 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -20 },
};

export function RepoFormStep({
  formData,
  onFormDataChange,
  hfEndpoints,
  defaultEndpoint,
  defaultMSEndpoint,
  previewError,
}: RepoFormStepProps) {
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
        <div className="space-y-6 py-5 px-6">
          {/* 来源 */}
          <section className="space-y-3">
            <SectionLabel>来源</SectionLabel>
            <div className="grid gap-4 grid-cols-3">
              <Field id="source" label="仓库来源">
                <Select
                  value={formData.source}
                  onValueChange={(v) =>
                    onFormDataChange({
                      ...formData,
                      source: v as RepoSource,
                      revision: "",
                    })
                  }
                >
                  <SelectTrigger id="source" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="huggingface">HuggingFace</SelectItem>
                    <SelectItem value="modelscope">ModelScope</SelectItem>
                  </SelectContent>
                </Select>
              </Field>

              <Field id="repo_type" label="类型">
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
              </Field>

              {formData.source === "huggingface" && (
                <Field id="hf_endpoint" label="HF Endpoint">
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
                </Field>
              )}

              {formData.source === "modelscope" && (
                <Field id="ms_endpoint" label="MS Endpoint">
                  <Input
                    id="ms_endpoint"
                    value={defaultMSEndpoint || "使用默认"}
                    readOnly
                    placeholder="https://modelscope.cn"
                    className="bg-muted/50 text-muted-foreground cursor-not-allowed"
                  />
                </Field>
              )}
            </div>
          </section>

          {/* 仓库标识 */}
          <section className="space-y-3">
            <SectionLabel>仓库标识</SectionLabel>
            <div className="space-y-4">
              <Field
                id="repo_id"
                label="仓库 ID"
                hint={
                  formData.source === "huggingface"
                    ? "HuggingFace 仓库标识符，格式为 org/repo-name"
                    : "ModelScope 仓库标识符，格式为 org/repo-name"
                }
              >
                <Input
                  id="repo_id"
                  placeholder="如：deepseek-ai/DeepSeek-V4-Flash"
                  value={formData.repo_id}
                  onChange={(e) =>
                    onFormDataChange({ ...formData, repo_id: e.target.value })
                  }
                  className="transition-all duration-200 focus:ring-2 focus:ring-primary/20"
                />
              </Field>

              <Field
                id="revision"
                label="版本 / 分支"
                hint={
                  formData.source === "huggingface"
                    ? "留空则使用 main"
                    : "留空则使用 master"
                }
              >
                <Input
                  id="revision"
                  placeholder={
                    formData.source === "huggingface" ? "main" : "master"
                  }
                  value={formData.revision}
                  onChange={(e) =>
                    onFormDataChange({ ...formData, revision: e.target.value })
                  }
                  className="transition-all duration-200 focus:ring-2 focus:ring-primary/20"
                />
              </Field>

              <Field id="access_token" label="访问令牌" hint="私有仓库需要填写">
                <Input
                  id="access_token"
                  type="password"
                  placeholder="可选"
                  value={formData.access_token}
                  onChange={(e) =>
                    onFormDataChange({
                      ...formData,
                      access_token: e.target.value,
                    })
                  }
                  className="transition-all duration-200 focus:ring-2 focus:ring-primary/20"
                />
              </Field>
            </div>
          </section>

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
