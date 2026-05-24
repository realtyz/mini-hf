import { useState, useMemo } from 'react'
import { Bell, Mail, Globe, SettingsIcon, Megaphone } from 'lucide-react'
import { cn } from '@/lib/utils'
import { motion, AnimatePresence } from 'framer-motion'
import { containerVariants, itemVariants, panelVariants } from '@/lib/animations/motion-config'
import { PageHeader } from '@/components/shared/PageHeader'
import { Skeleton } from '@/components/ui/skeleton'
import { useConfigSchema } from '@/hooks/api'
import { ConfigFormEngine } from './ConfigFormEngine'
import { SmtpTestAction } from './SmtpTestAction'
import { AnnouncementTab } from './AnnouncementTab'

type SettingsTabId = 'smtp' | 'huggingface' | 'notification' | 'announcement'

interface TabConfig {
  id: SettingsTabId
  label: string
  description: string
  icon: typeof Mail
}

const tabRegistry: TabConfig[] = [
  { id: 'smtp', label: '邮件配置', description: 'SMTP 邮件服务', icon: Mail },
  { id: 'huggingface', label: 'HF 配置', description: 'Endpoint 节点管理', icon: Globe },
  { id: 'notification', label: '通知', description: '告警与推送设置', icon: Bell },
  { id: 'announcement', label: '公告', description: '系统公告管理', icon: Megaphone },
]

function TabContent({ activeTab }: { activeTab: SettingsTabId }) {
  const schemaQuery = useConfigSchema()
  const schemaCategories = useMemo(
    () => schemaQuery.data?.data.categories ?? [],
    [schemaQuery.data?.data.categories]
  )

  const emailCategory = useMemo(
    () => schemaCategories.find((c) => c.id === 'email'),
    [schemaCategories]
  )
  const huggingfaceCategory = useMemo(
    () => schemaCategories.find((c) => c.id === 'huggingface'),
    [schemaCategories]
  )
  const notificationCategory = useMemo(
    () => schemaCategories.find((c) => c.id === 'notification'),
    [schemaCategories]
  )

  if (schemaQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-32 w-full rounded-xl" />
      </div>
    )
  }

  switch (activeTab) {
    case 'smtp':
      return emailCategory ? (
        <ConfigFormEngine
          category={emailCategory}
          actionSlot={(form) => <SmtpTestAction form={form} />}
        />
      ) : null
    case 'huggingface':
      return huggingfaceCategory ? (
        <ConfigFormEngine category={huggingfaceCategory} />
      ) : null
    case 'notification':
      return notificationCategory ? (
        <ConfigFormEngine category={notificationCategory} />
      ) : null
    case 'announcement':
      return <AnnouncementTab />
    default:
      return null
  }
}

export function Settings() {
  const [activeTab, setActiveTab] = useState<SettingsTabId>(tabRegistry[0].id)

  return (
    <motion.div
      className="flex flex-1 flex-col gap-5"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* Page header */}
      <motion.div variants={itemVariants}>
        <PageHeader
          icon={SettingsIcon}
          title="系统设置"
          subtitle="管理系统配置和偏好设置"
        />
      </motion.div>

      {/* Two-column: nav + content */}
      <motion.div variants={itemVariants} className="grid gap-5 lg:grid-cols-[240px_1fr] lg:items-start">

        {/* Desktop sidebar */}
        <nav
          className="hidden lg:flex flex-col rounded-xl border border-border/40 bg-card/80 backdrop-blur-sm overflow-hidden"
          role="tablist"
          aria-label="设置分类"
        >
          <div className="p-1.5 flex flex-col gap-1">
            {tabRegistry.map((tab) => {
              const Icon = tab.icon
              const isActive = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-all duration-200',
                    isActive
                      ? 'bg-muted text-foreground'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
                  )}
                >
                  {isActive && (
                    <motion.div
                      layoutId="active-tab-accent"
                      className="absolute left-1.5 top-2 bottom-2 w-0.5 rounded-full bg-primary"
                      transition={{ type: 'spring', stiffness: 400, damping: 28, mass: 0.8 }}
                    />
                  )}
                  <div
                    className={cn(
                      'flex size-8 shrink-0 items-center justify-center rounded-md transition-colors duration-200',
                      isActive
                        ? 'bg-primary/10 text-primary'
                        : 'text-muted-foreground/60 group-hover:text-muted-foreground'
                    )}
                  >
                    <Icon className="size-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium leading-tight">{tab.label}</div>
                    <div className="text-[11px] text-muted-foreground/60 mt-0.5 leading-tight">
                      {tab.description}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </nav>

        {/* Mobile nav — pill-style tabs */}
        <div className="relative lg:hidden" role="tablist" aria-label="设置分类">
          <div className="flex gap-1 p-1 bg-muted/50 rounded-xl">
            {tabRegistry.map((tab) => {
              const Icon = tab.icon
              const isActive = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'relative flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2.5 py-2.5 text-xs font-medium transition-all duration-200 whitespace-nowrap',
                    isActive
                      ? 'bg-background text-foreground shadow-sm ring-1 ring-border/30'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  <Icon className={cn('size-3.5 shrink-0 transition-colors duration-200', isActive && 'text-primary')} />
                  <span className="hidden sm:inline">{tab.label}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Tab content */}
        <div className="min-w-0">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={activeTab}
              variants={panelVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
            >
              <TabContent activeTab={activeTab} />
            </motion.div>
          </AnimatePresence>
        </div>
      </motion.div>
    </motion.div>
  )
}

export default Settings
