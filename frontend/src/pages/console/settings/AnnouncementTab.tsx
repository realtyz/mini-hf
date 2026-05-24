import { memo, useState, useCallback } from 'react'
import { toast } from 'sonner'
import { Edit, Pin, Trash2, Megaphone, Plus } from 'lucide-react'
import { SettingsSection, ActionsFooter } from './SettingsComponents'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  useAdminAnnouncements,
  useCreateAnnouncement,
  useUpdateAnnouncement,
  useDeleteAnnouncement,
} from '@/hooks/api'
import type {
  AnnouncementItem,
  AnnouncementCreateRequest,
  AnnouncementUpdateRequest,
} from '@/lib/api/types'

const announcementTypeConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' }> = {
  info: { label: '信息', variant: 'default' },
  warning: { label: '警告', variant: 'secondary' },
  urgent: { label: '紧急', variant: 'destructive' },
}

const emptyForm: AnnouncementCreateRequest = {
  title: '',
  content: '',
  announcement_type: 'info',
  is_pinned: false,
  is_active: true,
}

function AnnouncementListItem({
  item,
  onEdit,
  onDelete,
}: {
  item: AnnouncementItem
  onEdit: (item: AnnouncementItem) => void
  onDelete: (item: AnnouncementItem) => void
}) {
  const typeConfig = announcementTypeConfig[item.announcement_type] ?? announcementTypeConfig.info

  return (
    <li className="flex items-start justify-between gap-4 py-3.5 px-1 -mx-1 rounded-lg transition-colors duration-150 hover:bg-muted/30">
      <div className="min-w-0 space-y-1 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium truncate">{item.title || '无标题'}</span>
          {item.is_pinned && <Pin className="size-3 text-amber-500 shrink-0" />}
          <Badge variant={typeConfig.variant} className="text-[11px] px-1.5 py-0 h-5">
            {typeConfig.label}
          </Badge>
          {!item.is_active && (
            <Badge variant="outline" className="text-[11px] px-1.5 py-0 h-5">
              未发布
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground line-clamp-1">{item.content}</p>
        <p className="text-[11px] text-muted-foreground/60">{item.created_at}</p>
      </div>
      <div className="flex items-center gap-0.5 shrink-0">
        <Button variant="ghost" size="icon" className="size-8" onClick={() => onEdit(item)}>
          <Edit className="size-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="size-8" onClick={() => onDelete(item)}>
          <Trash2 className="size-3.5" />
        </Button>
      </div>
    </li>
  )
}

export const AnnouncementTab = memo(function AnnouncementTab() {
  const { data: announcements, isLoading } = useAdminAnnouncements()
  const createMutation = useCreateAnnouncement()
  const updateMutation = useUpdateAnnouncement()
  const deleteMutation = useDeleteAnnouncement()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState<AnnouncementCreateRequest>(emptyForm)
  const [initialForm, setInitialForm] = useState<AnnouncementCreateRequest>(emptyForm)
  const [deleteTarget, setDeleteTarget] = useState<AnnouncementItem | null>(null)

  const openCreate = useCallback(() => {
    setEditingId(null)
    setForm(emptyForm)
    setInitialForm(emptyForm)
    setDialogOpen(true)
  }, [])

  const openEdit = useCallback((announcement: AnnouncementItem) => {
    const data = {
      title: announcement.title,
      content: announcement.content,
      announcement_type: announcement.announcement_type,
      is_pinned: announcement.is_pinned,
      is_active: announcement.is_active,
    }
    setEditingId(announcement.id)
    setForm(data)
    setInitialForm(data)
    setDialogOpen(true)
  }, [])

  const setField = useCallback(
    <K extends keyof AnnouncementCreateRequest>(key: K, value: AnnouncementCreateRequest[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }))
    },
    []
  )

  const handleSave = useCallback(async () => {
    if (editingId !== null) {
      await updateMutation.mutateAsync({ id: editingId, ...form } as { id: number } & AnnouncementUpdateRequest)
      toast.success('公告已更新')
    } else {
      await createMutation.mutateAsync(form)
      toast.success('公告已创建')
    }
    setDialogOpen(false)
  }, [editingId, form, updateMutation, createMutation])

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return
    await deleteMutation.mutateAsync(deleteTarget.id)
    toast.success('公告已删除')
    setDeleteTarget(null)
  }, [deleteTarget, deleteMutation])

  const list = announcements ?? []

  return (
    <SettingsSection
      icon={<Megaphone className="size-4" />}
      title="公告管理"
      description="管理系统公告，影响所有用户的首页通知"
    >
      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-14 w-full rounded-lg" />
          <Skeleton className="h-14 w-full rounded-lg" />
          <Skeleton className="h-14 w-full rounded-lg" />
        </div>
      ) : list.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 gap-3">
          <div className="flex size-12 items-center justify-center rounded-full bg-muted">
            <Megaphone className="size-5 text-muted-foreground/50" />
          </div>
          <p className="text-sm text-muted-foreground">暂无公告</p>
          <Button variant="outline" size="sm" onClick={openCreate} className="gap-1.5">
            <Plus className="size-3.5" />
            新建公告
          </Button>
        </div>
      ) : (
        <>
          <ul className="divide-y divide-border/30">
            {list.map((item) => (
              <AnnouncementListItem
                key={item.id}
                item={item}
                onEdit={openEdit}
                onDelete={setDeleteTarget}
              />
            ))}
          </ul>
          <div className="mt-4 pt-1">
            <Button variant="outline" size="sm" onClick={openCreate} className="gap-1.5">
              <Plus className="size-3.5" />
              新建公告
            </Button>
          </div>
        </>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId !== null ? '编辑公告' : '新建公告'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="ann-title">标题</Label>
              <Input
                id="ann-title"
                value={form.title ?? ''}
                onChange={(e) => setField('title', e.target.value)}
                placeholder="公告标题"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ann-content">内容</Label>
              <Textarea
                id="ann-content"
                value={form.content}
                rows={4}
                onChange={(e) => setField('content', e.target.value)}
                placeholder="公告内容"
              />
            </div>
            <div className="space-y-1.5">
              <Label>类型</Label>
              <Select
                value={form.announcement_type}
                onValueChange={(v) => setField('announcement_type', v as AnnouncementItem['announcement_type'])}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="info">信息</SelectItem>
                  <SelectItem value="warning">警告</SelectItem>
                  <SelectItem value="urgent">紧急</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <Switch
                  id="ann-pinned"
                  checked={form.is_pinned ?? false}
                  onCheckedChange={(v) => setField('is_pinned', v)}
                />
                <Label htmlFor="ann-pinned" className="cursor-pointer">置顶</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="ann-active"
                  checked={form.is_active ?? false}
                  onCheckedChange={(v) => setField('is_active', v)}
                />
                <Label htmlFor="ann-active" className="cursor-pointer">发布</Label>
              </div>
            </div>
          </div>
          <ActionsFooter
            hasChanges
            isSaving={createMutation.isPending || updateMutation.isPending}
            onSave={handleSave}
            onReset={() => setForm({ ...initialForm })}
          />
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除公告</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除公告「{deleteTarget?.title || '无标题'}」吗？此操作不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? '删除中...' : '删除'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SettingsSection>
  )
})
