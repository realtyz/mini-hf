// UI strings centralization.
// This is a lightweight alternative to i18n for the Chinese-first app.

export const STRINGS = {
  // Generic
  loading: "加载中...",
  loadFailed: "加载失败",
  retry: "重试",
  refresh: "刷新",
  noData: "暂无数据",
  save: "保存",
  cancel: "取消",
  confirm: "确认",
  delete: "删除",
  copy: "复制",
  search: "搜索",
  clear: "清除",
  create: "新建",
  back: "返回",
  reset: "重置",

  // Actions
  copySuccess: "已复制",
  copyFailed: "复制失败",
  saveSuccess: "配置已保存",
  saveFailed: "保存失败",
  deleteSuccess: "删除成功",
  deleteFailed: "删除失败",
  resetSuccess: "已重置为上次保存的配置",
  operationFailed: "操作失败，请重试",

  // Task
  taskList: "任务列表",
  taskListSubtitle: "查看和管理模型/数据集下载任务",
  createTask: "新建任务",
  noTasks: "暂无任务",
  noMatchingTasks: "未找到匹配的任务",
  clearSearch: "清除搜索",
  pendingApproval: "待处理任务",
  pendingApprovalCount: (n: number) => `当前有 ${n} 个任务等待审批`,
  viewPendingApproval: "查看待审批",
  totalTasks: (n: number) => `共 ${n} 个任务`,
  taskPreviewTimeout: "预览任务超时，请稍后重试",

  // Cache Scan
  cacheScanNoResults: "暂无扫描结果",
  cacheScanDescription: "系统每日凌晨 3:00 自动扫描，或由管理员手动触发",
  cacheScanTrigger: "立即扫描",
  cacheScanScanning: "扫描中...",
  cacheScanLoadFailed: "加载扫描结果失败",
  cacheScanLoadFailedDesc: "请检查网络连接后重试",
  cacheScanAllClear: "暂无缓存数据",
  cacheScanAllClearDesc: "S3 存储中未发现任何仓库缓存",
  cacheScanDeleteSuccess: "仓库已彻底删除",
  cacheScanCopySuccess: "已复制仓库 ID",
  cacheScanBatchDelete: "批量删除",
  cacheScanBatchDeleteSelected: (n: number) => `批量删除 (${n})`,
  cacheScanBatchDeleteConfirmTitle: "确认批量删除仓库",
  cacheScanBatchDeleteStarted: (n: number) =>
    `批量删除已启动，正在删除 ${n} 个仓库...`,
  cacheScanBatchDeleteCompleted: (deleted: number) =>
    `批量删除完成：${deleted} 个仓库已删除`,
  cacheScanBatchDeleteCompletedWithFailures: (
    deleted: number,
    failed: number,
  ) => `批量删除完成：${deleted} 个成功，${failed} 个失败`,
  batchDeleteResultTitle: "批量删除结果",
  batchDeleteAllSuccess: "全部删除成功",
  batchDeleteResultSummary: (
    total: number,
    succeeded: number,
    failed: number,
  ) =>
    failed > 0
      ? `共 ${total} 个仓库，成功 ${succeeded} 个，失败 ${failed} 个`
      : `共 ${total} 个仓库全部删除成功`,
  batchDeleteResultClose: "确定",

  // Repository
  repoList: "仓库管理",
  repoListSubtitle: "管理和浏览已缓存的模型与数据集",
  repoLoadFailed: "仓库不存在或无法访问",
  repoDetailBack: "返回仓库列表",
  repoDelete: "删除仓库",
  repoCopySuccess: "仓库ID已复制",

  // Status labels
  statusActive: "活跃",
  statusUpdating: "更新中",
  statusCleaning: "清理中",
  statusInactive: "不完整",
  statusCleaned: "已清理",
  statusAll: "全部状态",
  statusPendingApproval: "等待审批",
  statusQueued: "排队中",
  statusRunning: "进行中",
  statusPausing: "暂停中",
  statusPaused: "已暂停",
  statusCompleted: "已完成",
  statusFailed: "失败",
  statusCancelled: "已取消",

  // Config
  configSaved: "配置已保存",

  // Repo Type
  model: "模型",
  dataset: "数据集",
  all: "全部",

  // Pagination
  showing: (start: number, end: number, total: number) =>
    `显示 ${start}-${end} 条，共 ${total} 条`,
} as const;
