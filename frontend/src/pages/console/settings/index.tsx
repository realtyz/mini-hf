import { useState, type FC } from 'react'
import { Bell, Mail, Globe, SettingsIcon, Megaphone } from 'lucide-react'
import { cn } from '@/lib/utils'
import { motion, AnimatePresence } from 'framer-motion'
import { containerVariants, itemVariants, panelVariants } from '@/lib/animations/motion-config'
import { PageHeader } from '@/components/shared/PageHeader'
import { SmtpTab } from './SmtpTab'
import { HfEndpointTab } from './HfEndpointTab'
import { NotificationTab } from './NotificationTab'
import { AnnouncementTab } from './AnnouncementTab'

type SettingsTabId = 'smtp' | 'huggingface' | 'notification' | 'announcement'

interface TabConfig {
  id: SettingsTabId
  label: string
  description: string
  icon: typeof Mail
  color: string
  bg: string
  component: FC
}

const tabRegistry: TabConfig[] = [
  {
    id: 'smtp',
    label: '邮件配置',
    description: 'SMTP 邮件服务',
    icon: Mail,
    color: 'text-blue-500',
    bg: 'bg-blue-500/10',
    component: SmtpTab,
  },
  {
    id: 'huggingface',
    label: 'HF 配置',
    description: 'Endpoint 节点管理',
    icon: Globe,
    color: 'text-violet-500',
    bg: 'bg-violet-500/10',
    component: HfEndpointTab,
  },
  {
    id: 'notification',
    label: '通知',
    description: '告警与推送设置',
    icon: Bell,
    color: 'text-amber-500',
    bg: 'bg-amber-500/10',
    component: NotificationTab,
  },
  {
    id: 'announcement',
    label: '公告',
    description: '系统公告管理',
    icon: Megaphone,
    color: 'text-emerald-500',
    bg: 'bg-emerald-500/10',
    component: AnnouncementTab,
  },
]

export function Settings() {
  const [activeTab, setActiveTab] = useState<SettingsTabId>(tabRegistry[0].id)

  return (
    <motion.div
      className="flex flex-1 flex-col gap-6"
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
      <motion.div variants={itemVariants} className="grid gap-6 lg:grid-cols-[260px_1fr] lg:items-start">

        {/* Desktop sidebar — glass card */}
        <nav
          className="hidden lg:flex flex-col rounded-2xl border border-border/60 bg-card/70 backdrop-blur-sm overflow-hidden shadow-xs"
          role="tablist"
          aria-label="设置分类"
        >
          <div className="p-2.5 flex flex-col gap-0.5">
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
                    'relative flex items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-all duration-200 group',
                    isActive
                      ? 'bg-muted shadow-sm'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
                  )}
                >
                  {/* Animated left accent */}
                  {isActive && (
                    <motion.div
                      layoutId="active-tab-accent"
                      className="absolute left-0 top-2.5 bottom-2.5 w-0.5 rounded-full bg-primary"
                      transition={{ type: 'spring', stiffness: 350, damping: 30, mass: 1 }}
                    />
                  )}
                  <div
                    className={cn(
                      'flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors duration-200',
                      isActive ? tab.bg : 'bg-muted/50 group-hover:bg-muted'
                    )}
                  >
                    <Icon className={cn('size-4 transition-colors duration-200', isActive ? tab.color : 'text-muted-foreground')} />
                  </div>
                  <div className="flex-1 min-w-0 pt-0.5">
                    <div className={cn('text-sm font-medium transition-colors duration-200', isActive && 'text-foreground')}>
                      {tab.label}
                    </div>
                    <div className="text-[11px] text-muted-foreground/70 mt-0.5 leading-tight">
                      {tab.description}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </nav>

        {/* Mobile nav — refined pill-style */}
        <div className="relative lg:hidden" role="tablist" aria-label="设置分类">
          <div className="flex gap-1 p-1 bg-muted/60 rounded-xl">
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
                    'relative flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-medium transition-all duration-200 whitespace-nowrap',
                    isActive
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  <Icon className={cn('size-3.5 shrink-0 transition-colors duration-200', isActive && tab.color)} />
                  <span className="hidden sm:inline">{tab.label}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Tab content */}
        <div className="min-w-0">
          <AnimatePresence mode="wait" initial={false}>
            {tabRegistry.map((tab) =>
              activeTab === tab.id ? (
                <motion.div
                  key={tab.id}
                  variants={panelVariants}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                >
                  <tab.component />
                </motion.div>
              ) : null
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </motion.div>
  )
}

export default Settings
