import { useMemo, useState } from 'react'
import {
  type ColumnDef,
  type ColumnFiltersState,
  type SortingState,
  type VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import {
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconChevronsLeft,
  IconChevronsRight,
  IconCircleCheckFilled,
  IconLoader,
  IconPlus,
  IconRefresh,
  IconX,
  IconClock,
  IconClipboardCheck,
  IconPlayerPause,
} from '@tabler/icons-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import { useRecentTasks } from '@/hooks/api/use-dashboard-queries'
import { useTaskProgress } from '@/hooks/api/use-task-progress'
import type { TaskResponse, TaskStatus } from '@/lib/api-types'
import { formatDistanceToNow } from '@/lib/utils'

// 任务状态映射
const statusConfig: Record<TaskStatus, { label: string; icon: React.ReactNode; color: string }> = {
  pending_approval: {
    label: '待审批',
    icon: <IconClipboardCheck className="size-3.5 text-yellow-500" />,
    color: 'bg-yellow-50 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300',
  },
  pending: {
    label: '等待中',
    icon: <IconClock className="size-3.5 text-gray-500" />,
    color: 'bg-gray-50 text-gray-700 dark:bg-gray-950 dark:text-gray-300',
  },
  running: {
    label: '进行中',
    icon: <IconLoader className="size-3.5 animate-spin text-blue-500" />,
    color: 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  },
  completed: {
    label: '已完成',
    icon: <IconCircleCheckFilled className="size-3.5 text-green-500" />,
    color: 'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300',
  },
  failed: {
    label: '失败',
    icon: <IconX className="size-3.5 text-red-500" />,
    color: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300',
  },
  canceling: {
    label: '取消中',
    icon: <IconPlayerPause className="size-3.5 text-orange-500" />,
    color: 'bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-300',
  },
  cancelled: {
    label: '已取消',
    icon: <IconX className="size-3.5 text-gray-500" />,
    color: 'bg-gray-50 text-gray-700 dark:bg-gray-950 dark:text-gray-300',
  },
}

// 格式化文件大小
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

// 进度单元格组件
function ProgressCell({ taskId, status }: { taskId: number; status: TaskStatus }) {
  const { data: progress } = useTaskProgress(taskId, status)

  if (!progress) {
    return <span className="text-xs text-muted-foreground">-</span>
  }

  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-16 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${progress.progress_percent}%` }}
        />
      </div>
      <span className="text-xs text-muted-foreground">
        {progress.progress_percent}%
      </span>
    </div>
  )
}

export function TasksTable() {
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})
  const [rowSelection, setRowSelection] = useState({})
  const [activeTab, setActiveTab] = useState('all')
  const [pagination, setPagination] = useState({
    pageIndex: 0,
    pageSize: 10,
  })

  const { data: tasksData, isLoading, refetch } = useRecentTasks(50)

  const tasks = useMemo(() => {
    if (!tasksData?.data) return []
    return tasksData.data
  }, [tasksData])

  // 根据tab筛选数据
  const filteredData = useMemo(() => {
    if (activeTab === 'all') return tasks
    return tasks.filter((task: TaskResponse) => {
      switch (activeTab) {
        case 'running':
          return task.status === 'running'
        case 'completed':
          return task.status === 'completed'
        case 'failed':
          return task.status === 'failed'
        default:
          return true
      }
    })
  }, [tasks, activeTab])

  const columns: ColumnDef<TaskResponse>[] = [
    {
      id: 'select',
      header: ({ table }) => (
        <div className="flex items-center justify-center">
          <Checkbox
            checked={
              table.getIsAllPageRowsSelected() ||
              (table.getIsSomePageRowsSelected() && 'indeterminate')
            }
            onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
            aria-label="全选"
          />
        </div>
      ),
      cell: ({ row }) => (
        <div className="flex items-center justify-center">
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(!!value)}
            aria-label="选择行"
          />
        </div>
      ),
      enableSorting: false,
      enableHiding: false,
    },
    {
      accessorKey: 'repo_id',
      header: '任务名称',
      cell: ({ row }) => (
        <div className="font-medium truncate max-w-50">
          {row.getValue('repo_id')}
        </div>
      ),
    },
    {
      accessorKey: 'repo_type',
      header: '类型',
      cell: ({ row }) => {
        const type = row.getValue('repo_type') as string
        return (
          <Badge
            variant="secondary"
            className={
              type === 'model'
                ? 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                : 'bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300'
            }
          >
            {type === 'model' ? '模型' : '数据集'}
          </Badge>
        )
      },
    },
    {
      accessorKey: 'status',
      header: '状态',
      cell: ({ row }) => {
        const status = row.getValue('status') as TaskStatus
        const config = statusConfig[status]
        return (
          <Badge variant="outline" className={`px-1.5 gap-1 ${config.color}`}>
            {config.icon}
            {config.label}
          </Badge>
        )
      },
    },
    {
      id: 'progress',
      header: '进度',
      cell: ({ row }) => {
        const task = row.original
        if (task.status === 'running') {
          return <ProgressCell taskId={task.id} status={task.status} />
        }
        if (task.status === 'completed') {
          return (
            <div className="flex items-center gap-2">
              <div className="h-2 w-16 overflow-hidden rounded-full bg-muted">
                <div className="h-full w-full rounded-full bg-green-500" />
              </div>
              <span className="text-xs text-muted-foreground">100%</span>
            </div>
          )
        }
        return <span className="text-xs text-muted-foreground">-</span>
      },
    },
    {
      accessorKey: 'total_storage',
      header: '大小',
      cell: ({ row }) => (
        <span className="text-muted-foreground text-sm">
          {formatBytes(row.getValue('total_storage') || 0)}
        </span>
      ),
    },
    {
      accessorKey: 'source',
      header: '来源',
      cell: ({ row }) => (
        <Badge variant="outline" className="text-xs capitalize">
          {row.getValue('source')}
        </Badge>
      ),
    },
    {
      accessorKey: 'created_at',
      header: '创建时间',
      cell: ({ row }) => {
        const date = row.getValue('created_at') as string
        return (
          <span className="text-muted-foreground text-sm">
            {date ? formatDistanceToNow(new Date(date)) : '-'}
          </span>
        )
      },
    },
  ]

  const table = useReactTable({
    data: filteredData,
    columns,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    onPaginationChange: setPagination,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection,
      pagination,
    },
  })

  if (isLoading) {
    return (
      <div className="px-4 lg:px-6">
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-32" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-64 w-full" />
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full flex-col justify-start gap-6">
      <div className="flex items-center justify-between px-4 lg:px-6">
        <TabsList>
          <TabsTrigger value="all">全部</TabsTrigger>
          <TabsTrigger value="running">进行中</TabsTrigger>
          <TabsTrigger value="completed">已完成</TabsTrigger>
          <TabsTrigger value="failed">失败</TabsTrigger>
        </TabsList>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <IconRefresh className="size-4 mr-1" />
            刷新
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <IconChevronDown className="size-4" />
                <span className="hidden lg:inline ml-1">列显示</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {table
                .getAllColumns()
                .filter((column) => column.getCanHide())
                .map((column) => {
                  return (
                    <DropdownMenuCheckboxItem
                      key={column.id}
                      className="capitalize"
                      checked={column.getIsVisible()}
                      onCheckedChange={(value) =>
                        column.toggleVisibility(!!value)
                      }
                    >
                      {column.id === 'select'
                        ? '选择'
                        : column.id === 'actions'
                          ? '操作'
                          : column.id}
                    </DropdownMenuCheckboxItem>
                  )
                })}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="default" size="sm">
            <IconPlus className="size-4" />
            <span className="hidden lg:inline ml-1">新建任务</span>
          </Button>
        </div>
      </div>

      <TabsContent value={activeTab} className="relative flex flex-col gap-4 overflow-auto px-4 lg:px-6">
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader className="bg-muted sticky top-0 z-10">
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => {
                    return (
                      <TableHead key={header.id}>
                        {header.isPlaceholder
                          ? null
                          : flexRender(
                              header.column.columnDef.header,
                              header.getContext()
                            )}
                      </TableHead>
                    )
                  })}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody className="**:data-[slot=table-cell]:first:w-8">
              {table.getRowModel().rows?.length ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow
                    key={row.id}
                    data-state={row.getIsSelected() && 'selected'}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext()
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={columns.length}
                    className="h-24 text-center"
                  >
                    暂无数据
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        <div className="flex items-center justify-between px-4">
          <div className="text-muted-foreground hidden flex-1 text-sm lg:flex">
            已选择 {table.getFilteredSelectedRowModel().rows.length} 条，共{' '}
            {table.getFilteredRowModel().rows.length} 条
          </div>
          <div className="flex w-full items-center gap-8 lg:w-fit">
            <div className="hidden items-center gap-2 lg:flex">
              <Label htmlFor="rows-per-page" className="text-sm font-medium">
                每页行数
              </Label>
              <Select
                value={`${table.getState().pagination.pageSize}`}
                onValueChange={(value) => {
                  table.setPageSize(Number(value))
                }}
              >
                <SelectTrigger size="sm" className="w-20" id="rows-per-page">
                  <SelectValue
                    placeholder={table.getState().pagination.pageSize}
                  />
                </SelectTrigger>
                <SelectContent side="top">
                  {[10, 20, 30, 40, 50].map((pageSize) => (
                    <SelectItem key={pageSize} value={`${pageSize}`}>
                      {pageSize}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex w-fit items-center justify-center text-sm font-medium">
              第 {table.getState().pagination.pageIndex + 1} /{' '}
              {table.getPageCount()} 页
            </div>
            <div className="ml-auto flex items-center gap-2 lg:ml-0">
              <Button
                variant="outline"
                className="hidden h-8 w-8 p-0 lg:flex"
                onClick={() => table.setPageIndex(0)}
                disabled={!table.getCanPreviousPage()}
              >
                <span className="sr-only">跳转到第一页</span>
                <IconChevronsLeft className="size-4" />
              </Button>
              <Button
                variant="outline"
                className="size-8"
                size="icon"
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
              >
                <span className="sr-only">跳转到上一页</span>
                <IconChevronLeft className="size-4" />
              </Button>
              <Button
                variant="outline"
                className="size-8"
                size="icon"
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
              >
                <span className="sr-only">跳转到下一页</span>
                <IconChevronRight className="size-4" />
              </Button>
              <Button
                variant="outline"
                className="hidden size-8 lg:flex"
                size="icon"
                onClick={() => table.setPageIndex(table.getPageCount() - 1)}
                disabled={!table.getCanNextPage()}
              >
                <span className="sr-only">跳转到最后一页</span>
                <IconChevronsRight className="size-4" />
              </Button>
            </div>
          </div>
        </div>
      </TabsContent>
    </Tabs>
  )
}

export default TasksTable
