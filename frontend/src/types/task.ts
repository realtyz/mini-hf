export type TaskStatus =
  | 'pending_approval'
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'canceling'
  | 'cancelled'

export interface TaskResponse {
  id: number
  repo_id: string
  repo_type: 'model' | 'dataset'
  status: TaskStatus
  total_storage: number
  created_at: string
  updated_at: string
  // Add other task fields as needed
}

export interface TaskProgressResponse {
  progress_percent: number
  speed_bytes_per_sec: number
  current_file: string
  downloaded_bytes: number
  total_bytes: number
}
