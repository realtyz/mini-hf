import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart'
import { Skeleton } from '@/components/ui/skeleton'
import { useTaskTrends } from '@/hooks/api/use-dashboard-queries'
import { cn } from '@/lib/utils'
import { motion } from 'framer-motion'
import { useState } from 'react'

// Color palette aligned with system badge colors:
// emerald=success, amber=pending, red=failed
const chartConfig = {
  completed: {
    label: '已完成',
    color: 'hsl(160, 84%, 39%)', // emerald-500
  },
  failed: {
    label: '失败',
    color: 'hsl(0, 84%, 60%)', // red-500
  },
  pending: {
    label: '等待中',
    color: 'hsl(38, 92%, 50%)', // amber-500
  },
} as const

// Legend item component with hover interaction
function LegendItem({
  color,
  label,
  isActive,
  onToggle,
}: {
  color: string
  label: string
  isActive: boolean
  onToggle: () => void
}) {
  return (
    <button
      onClick={onToggle}
      className={cn(
        'flex items-center gap-1.5 px-2 py-1 rounded-md text-xs transition-all duration-200',
        'hover:bg-muted/50',
        isActive ? 'opacity-100' : 'opacity-40'
      )}
    >
      <span
        className="h-2 w-2 rounded-full transition-transform duration-200"
        style={{
          backgroundColor: color,
          transform: isActive ? 'scale(1)' : 'scale(0.8)',
        }}
      />
      <span className="text-muted-foreground">{label}</span>
    </button>
  )
}

// Summary stat badge
function StatBadge({
  label,
  value,
  color,
}: {
  label: string
  value: number
  color: string
}) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted/50">
      <span
        className="h-2 w-2 rounded-full"
        style={{ backgroundColor: color }}
      />
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-semibold">{value}</span>
    </div>
  )
}

export function ChartSection() {
  const { trends, isLoading } = useTaskTrends()
  const [activeBars, setActiveBars] = useState<Record<string, boolean>>({
    completed: true,
    pending: true,
    failed: true,
  })

  const toggleBar = (key: string) => {
    setActiveBars((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  // Calculate totals for summary
  const totals = trends.reduce(
    (acc, day) => ({
      completed: acc.completed + day.completed,
      pending: acc.pending + day.pending,
      failed: acc.failed + day.failed,
    }),
    { completed: 0, pending: 0, failed: 0 }
  )

  if (isLoading) {
    return (
      <Card className="overflow-hidden">
        <CardHeader className="pb-2">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-4 w-48 mt-2" />
        </CardHeader>
        <CardContent className="pt-4">
          <Skeleton className="h-[280px] w-full" />
        </CardContent>
      </Card>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
    >
      <Card className="overflow-hidden border transition-all duration-300 hover:shadow-lg hover:shadow-black/5 dark:hover:shadow-black/20">
        <CardHeader className="pb-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1">
              <CardTitle className="text-lg font-semibold">任务趋势</CardTitle>
              <CardDescription className="text-sm">
                最近7天任务状态分布情况
              </CardDescription>
            </div>

            {/* Interactive Legend */}
            <div className="flex flex-wrap items-center gap-1">
              <LegendItem
                color="hsl(160, 84%, 39%)"
                label="完成"
                isActive={activeBars.completed}
                onToggle={() => toggleBar('completed')}
              />
              <LegendItem
                color="hsl(38, 92%, 50%)"
                label="等待"
                isActive={activeBars.pending}
                onToggle={() => toggleBar('pending')}
              />
              <LegendItem
                color="hsl(0, 84%, 60%)"
                label="失败"
                isActive={activeBars.failed}
                onToggle={() => toggleBar('failed')}
              />
            </div>
          </div>

          {/* Summary stats row */}
          <div className="flex flex-wrap gap-2 pt-3 border-t mt-3">
            <StatBadge
              label="总完成"
              value={totals.completed}
              color="hsl(160, 84%, 39%)"
            />
            <StatBadge
              label="待处理"
              value={totals.pending}
              color="hsl(38, 92%, 50%)"
            />
            <StatBadge
              label="失败"
              value={totals.failed}
              color="hsl(0, 84%, 60%)"
            />
          </div>
        </CardHeader>

        <CardContent className="pt-0">
          <ChartContainer
            config={chartConfig}
            className="aspect-auto h-[260px] w-full"
          >
            <BarChart
              data={trends}
              margin={{ top: 10, right: 10, bottom: 10, left: 0 }}
              barGap={4}
              barCategoryGap="20%"
            >
              <CartesianGrid
                vertical={false}
                strokeDasharray="4 4"
                stroke="hsl(var(--border))"
                opacity={0.5}
              />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tickMargin={12}
                tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                allowDecimals={false}
                tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
              />
              <ChartTooltip
                cursor={{ fill: 'hsl(var(--muted))', opacity: 0.3 }}
                content={
                  <ChartTooltipContent
                    indicator="dot"
                    className="border shadow-lg"
                  />
                }
              />
              {activeBars.completed && (
                <Bar
                  dataKey="completed"
                  fill="hsl(160, 84%, 39%)"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={40}
                />
              )}
              {activeBars.pending && (
                <Bar
                  dataKey="pending"
                  fill="hsl(38, 92%, 50%)"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={40}
                />
              )}
              {activeBars.failed && (
                <Bar
                  dataKey="failed"
                  fill="hsl(0, 84%, 60%)"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={40}
                />
              )}
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>
    </motion.div>
  )
}

export default ChartSection
