/**
 * API 类型定义
 * 对应后端 Pydantic 模型
 */

// ==================== 通用响应 ====================

export interface ApiResponse<T> {
  code: number
  message: string
  data: T
}

export interface ApiError {
  code: number
  message: string
}

export interface PaginationParams {
  page?: number
  page_size?: number
}

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  page_size: number
  pages: number
}

// ==================== 认证 ====================

export interface LoginRequest {
  /** FastAPI OAuth2 要求字段名是 username */
  username: string
  password: string
}

export interface LoginResponse {
  access_token: string
  refresh_token: string
  token_type: string
  /** Access token expiration time in seconds */
  expires_in: number
}

export interface TokenVerifyResponse {
  valid: boolean
  email: string
  user_id?: number
  role?: UserRole
}

export interface RegisterRequest {
  name: string
  email: string
  password: string
}

// ==================== 邮箱验证码 ====================

export interface SendVerifyCodeRequest {
  email: string
}

export interface SendVerifyCodeResponse {
  resend_after: number // 下次可重发秒数
}

export interface VerifyEmailRequest {
  email: string
  code: string
}

export interface VerifyEmailResponse {
  verified: boolean
  email: string
}

export interface RegisterWithCodeRequest {
  email: string
  code: string
  name: string
  password: string
}

// ==================== 用户 ====================

export type UserRole = 'admin' | 'user'

export interface UserResponse {
  id: number
  name: string
  email: string
  role: UserRole
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface UserCreateRequest {
  name: string
  email: string
  password: string
  role?: UserRole
  is_active?: boolean
}

export interface UserUpdateRequest {
  name?: string
  email?: string
  role?: UserRole
  is_active?: boolean
}

export interface UserMeUpdateRequest {
  name?: string
}

export interface UserPasswordUpdateRequest {
  current_password: string
  new_password: string
}

// ==================== 任务 ====================

export type TaskStatus =
  | 'pending_approval'
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'canceling'
  | 'cancelled'

export interface TaskCreatorUser {
  id: number
  name: string
  email: string
}

export interface TaskResponse {
  id: number
  source: string
  repo_id: string
  repo_type: string
  revision: string
  hf_endpoint: string | null
  status: TaskStatus
  error_message: string | null
  created_at: string
  reviewed_at: string | null
  updated_at: string
  started_at: string | null
  completed_at: string | null
  pinned_at: string | null
  required_storage: number
  creator_user_id: number
  creator_user: TaskCreatorUser | null
  total_storage: number
  required_file_count: number
  total_file_count: number
  repo_items: unknown[]
  commit_hash: string | null
  downloaded_file_count: number | null
  downloaded_bytes: number | null
}

export interface TaskListResponse {
  code: number
  message: string
  data: TaskResponse[]
  total: number
}

export interface TaskListFilters {
  status?: TaskStatus
  repo_type?: string
  source?: string
}

// ==================== 仓库/模型 ====================

export type RepoSource = 'huggingface' | 'modelscope'
export type RepoType = 'model' | 'dataset'

export interface RepoDownloadRequest {
  source: RepoSource
  repo_id: string
  repo_type: RepoType
  revision?: string
  access_token?: string
  full_download?: boolean
  allow_patterns?: string[]
  ignore_patterns?: string[]
}

export interface DryRunRequest {
  repo_id: string
  repo_type: RepoType
  revision?: string
  hf_endpoint?: string
  access_token?: string
  include_patterns?: string[]
  exclude_patterns?: string[]
}

export interface FileInfo {
  path: string
  size: number
  checksum?: string
}

export interface DryRunResponse {
  files: FileInfo[]
  total_size: number
  file_count: number
}

export interface RepoResponse {
  id: string
  repo_id: string
  repo_type: RepoType
  source: RepoSource
  revision: string
  local_path: string
  created_at: string
  updated_at: string
}

// ==================== 仓库列表 API ====================

export type RepoStatus = 'active' | 'inactive' | 'updating' | 'cleaning' | 'cleaned'

export interface RepoProfile {
  id: number
  repo_id: string
  repo_type: 'model' | 'dataset'
  pipeline_tag: string | null
  cached_commits: number
  downloads: number
  first_cached_at: string | null
  cache_updated_at: string | null
  last_downloaded_at: string | null
  status: RepoStatus
}

export interface RepoListResponse {
  code: number
  message: string
  data: RepoProfile[]
  total: number
}

export interface RepoListParams {
  skip?: number
  limit?: number
  statuses?: RepoStatus[]
  pipeline_tag?: string
  search?: string
  sort_by?: string
  sort_order?: string
}

// ==================== 仓库详情 ====================

export type SnapshotStatus = 'active' | 'archived'

export interface RepoSnapshot {
  id: number
  revision: string
  commit_hash: string
  committed_at: string | null
  created_at: string
  updated_at: string
  status: SnapshotStatus
  total_size: number | null
  cached_size: number | null
}

export interface RepoDetailData {
  profile: RepoProfile
  snapshots: RepoSnapshot[]
}

export interface RepoDetailResponse {
  code: number
  message: string
  data: RepoDetailData
}

// ==================== Repo Tree ====================

export type TreeItemType = 'file' | 'directory'

export interface RepoTreeItem {
  path: string
  type: TreeItemType
  size: number
  is_cached: boolean | null
}

export interface RepoTreeResponse {
  code: number
  message: string
  data: RepoTreeItem[]
}

// ==================== Dashboard Stats ====================

export interface DashboardStats {
  total_repos: number
  total_files: number
  storage_capacity: number
  total_downloads: number
}

export interface DashboardStatsResponse {
  code: number
  message: string
  data: DashboardStats
}

// ==================== 配置 ====================

export interface ConfigItem {
  key: string
  value: string
  category: string
  description?: string
  is_sensitive: boolean
  updated_at?: string
  updated_by?: number
}

export interface ConfigCreateRequest {
  key: string
  value: string
  category: string
  description?: string
  is_sensitive?: boolean
}

export interface ConfigUpdateRequest {
  value?: string
  description?: string
}

export interface ConfigBatchUpdateRequest {
  configs: Array<{
    key: string
    value: string
    category?: string
    description?: string
    is_sensitive?: boolean
  }>
}

export interface ConfigListResponse {
  code: number
  message: string
  data: ConfigItem[]
  total: number
}

export interface SMTPConfigResponse {
  host: string
  port: number
  username: string
  use_tls: boolean
  from_email: string
  is_configured: boolean
}

export interface SMTPTestRequest {
  host: string
  port?: number
  username: string
  password: string
  use_tls?: boolean
  from_email?: string
}

export interface SMTPTestResponse {
  code: number
  message: string
  data: boolean
  test_message: string
}

export interface SMTPSaveRequest {
  host: string
  port?: number
  username: string
  password: string
  use_tls?: boolean
  from_email: string
  test_before_save?: boolean
}

export interface HFEndpointConfigResponse {
  endpoints: string[]
  default_endpoint: string
}

export interface HFEndpointSaveRequest {
  endpoints: string[]
  default_endpoint: string
}

// ==================== 通知配置 ====================

export interface NotificationConfigResponse {
  email: string
  task_approval_push: boolean
  auto_approve_enabled: boolean
  auto_approve_threshold_gb: number
}

export interface NotificationSaveRequest {
  email: string
  task_approval_push: boolean
  auto_approve_enabled: boolean
  auto_approve_threshold_gb: number
}

// ==================== 公告配置 ====================

export type AnnouncementType = 'info' | 'warning' | 'urgent'

export interface AnnouncementConfigResponse {
  content: string
  announcement_type: AnnouncementType
  is_active: boolean
}

export interface AnnouncementSaveRequest {
  content: string
  announcement_type: AnnouncementType
  is_active: boolean
}

// ==================== 健康检查 ====================

export interface HealthResponse {
  status: string
}

// ==================== 任务进度 ====================

export type FileProgressStatus = 'pending' | 'downloading' | 'uploading' | 'completed' | 'failed'

export interface FileProgressItem {
  /** 文件路径 */
  path: string
  /** 文件状态: pending/downloading/uploading/completed/failed */
  status: FileProgressStatus
  /** 已处理字节数（下载或上传） */
  downloaded_bytes: number
  /** 总字节数 */
  total_bytes: number
  /** 下载进度百分比 */
  progress_percent: number
  /** 下载速度(字节/秒) */
  speed_bytes_per_sec: number | null
  /** 开始时间(ISO格式) */
  started_at: string | null
  /** 完成时间(ISO格式) */
  completed_at: string | null
  /** 错误信息(如果失败) */
  error_message: string | null
}

export interface TaskProgressData {
  /** 任务ID */
  task_id: number
  /** 任务状态: running/completed/failed */
  status: string
  /** 整体进度百分比 */
  progress_percent: number
  /** 已完成文件数 */
  downloaded_files: number
  /** 总文件数 */
  total_files: number
  /** 已处理字节数（下载或上传） */
  downloaded_bytes: number
  /** 总字节数 */
  total_bytes: number
  /** 当前正在下载的文件 */
  current_file: string | null
  /** 当前下载速度 */
  speed_bytes_per_sec: number | null
  /** 预计剩余时间(秒) */
  eta_seconds: number | null
  /** 最后更新时间(ISO格式) */
  updated_at: string
  /** 文件进度列表 */
  files: FileProgressItem[]
}

export type TaskProgressResponse = ApiResponse<TaskProgressData>

// ==================== 异步预览任务 ====================

export type PreviewTaskStatus = 'pending' | 'fetching' | 'processing' | 'completed' | 'failed'

export interface PreviewItem {
  path: string
  size: number
  type: 'file' | 'directory'
  required: boolean
}

export interface TaskPreviewData {
  repo_id: string
  repo_type: string
  revision: string
  commit_hash: string | null
  total_storage: number
  total_file_count: number
  required_storage: number
  required_file_count: number
  items: PreviewItem[]
  cache_key: string
  has_update: boolean
  cached_commit_hash: string | null
  all_required_cached: boolean
}

export interface AsyncPreviewTaskResponse {
  code: number
  message: string
  data: {
    task_id: string
    status: PreviewTaskStatus
    message: string
  }
}

export interface AsyncPreviewTaskStatusData {
  task_id: string
  status: PreviewTaskStatus
  repo_id: string
  repo_type: string
  revision: string
  progress_message: string
  progress_percent: number
  error_message: string | null
  result: TaskPreviewData | null
}

export type AsyncPreviewTaskStatusResponse = ApiResponse<AsyncPreviewTaskStatusData>
