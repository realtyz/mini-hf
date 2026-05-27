/**
 * 集中管理的 API 端点
 * 所有路径字符串集中定义，各 hooks 引用端点常量，便于重构和维护。
 */
const endpoints = {
  auth: {
    signIn: '/auth/sign-in',
    register: '/auth/register',
    sendVerifyCode: '/auth/send-verify-code',
    verifyEmail: '/auth/verify-email',
    registerWithCode: '/auth/register-with-code',
    verify: '/auth/verify',
    refresh: '/auth/refresh',
    logout: '/auth/logout',
    forgotPassword: '/auth/forgot-password',
    resetPassword: '/auth/reset-password',
  },

  user: {
    me: '/user/me',
    list: '/user/list',
    detail: (id: number) => `/user/${id}`,
    create: '/user',
    update: (id: number) => `/user/${id}`,
    delete: (id: number) => `/user/${id}`,
    resetPassword: (id: number) => `/user/${id}/reset-password`,
  },

  task: {
    list: '/task/list',
    listPublic: '/task/list-public',
    activePublic: '/task/active-public',
    preview: '/task/preview',
    previewStatus: (taskId: string) => `/task/preview/${taskId}`,
    detail: (id: number) => `/task/${id}`,
    review: (id: number) => `/task/${id}/review`,
    cancel: (id: number) => `/task/${id}/cancel`,
    pause: (id: number) => `/task/${id}/pause`,
    resume: (id: number) => `/task/${id}/resume`,
    pin: (id: number) => `/task/${id}/pin`,
    unpin: (id: number) => `/task/${id}/unpin`,
    retry: (id: number) => `/task/${id}/retry`,
    progress: (id: number) => `/task/${id}/progress`,
    create: '/task',
  },

  repo: {
    hfList: '/hf_repo/list',
    hfListPublic: '/hf_repo/list-public',
    msList: '/ms_repo/list',
    hfDetail: (repoId: string) => `/hf_repo/${encodeURIComponent(repoId)}`,
    hfModel: (repoId: string) => `/hf_repo/model/${encodeURIComponent(repoId)}`,
    hfDataset: (repoId: string) => `/hf_repo/dataset/${encodeURIComponent(repoId)}`,
    tree: (repoId: string, commitHash: string) =>
      `/hf_repo/${encodeURIComponent(repoId)}/tree/${encodeURIComponent(commitHash)}`,
    fileUrl: (repoId: string, commitHash: string, path: string) =>
      `/hf_repo/${encodeURIComponent(repoId)}/file?commit_hash=${encodeURIComponent(commitHash)}&path=${encodeURIComponent(path)}`,
  },

  dashboard: {
    stats: '/dashboard/stats',
  },

  cache: {
    scanResult: '/cache/scan/result',
    scanRun: '/cache/scan/run',
  },

  config: {
    list: '/config',
    schema: '/config/schema',
    detail: (key: string) => `/config/${encodeURIComponent(key)}`,
    create: '/config',
    update: (key: string) => `/config/${encodeURIComponent(key)}`,
    delete: (key: string) => `/config/${encodeURIComponent(key)}`,
    batch: '/config/batch',
    category: (category: string) => `/config/category/${category}`,
    init: '/config/init',
    smtpTest: '/config/category/smtp/test',
  },

  health: {
    announcement: '/health/announcement',
    hfEndpoints: '/health/hf-endpoints',
  },

  system: {
    announcements: '/system/announcements',
    announcementsAdmin: '/system/announcements/admin',
  },
} as const

export default endpoints
