// Dashboard 类型定义

export interface Task {
  id: number
  name: string
  type: 'model' | 'dataset'
  status: 'completed' | 'running' | 'failed' | 'pending'
  progress: number
  source: string
  createdAt: string
  size: string
}

export interface StatCardData {
  title: string
  value: string
  change: number
  trend: 'up' | 'down'
  description: string
}

export interface ChartData {
  month: string
  downloads: number
  cacheHits: number
}

export interface TaskTableFilters {
  status?: Task['status']
  type?: Task['type']
  search?: string
}
