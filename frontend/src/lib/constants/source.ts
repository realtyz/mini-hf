/**
 * 任务来源 / 仓库类型 → 显示文案映射
 *
 * 用于详情/列表等显示态格式化。表单选项（SelectItem）仍各自显式定义，
 * 不由此处派生——二者用途不同，避免过度抽象。
 */
export const SOURCE_LABELS: Record<string, string> = {
  huggingface: "HuggingFace",
  modelscope: "ModelScope",
};

export const REPO_TYPE_LABELS: Record<string, string> = {
  model: "模型",
  dataset: "数据集",
};

export function getSourceLabel(source: string): string {
  return SOURCE_LABELS[source] ?? source;
}

export function getRepoTypeLabel(repoType: string): string {
  return REPO_TYPE_LABELS[repoType] ?? repoType;
}
