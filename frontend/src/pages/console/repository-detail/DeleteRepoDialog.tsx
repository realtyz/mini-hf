import { Trash2, Loader2 } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { buttonVariants } from '@/components/ui/button'
import { useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query/keys'
import { useDeleteRepo } from '@/hooks/api/use-repo-queries'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface DeleteRepoDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  repoId: string
  repoName: string
  onDeleted: () => void
}

export function DeleteRepoDialog({ open, onOpenChange, repoId, repoName, onDeleted }: DeleteRepoDialogProps) {
  const queryClient = useQueryClient()
  const deleteRepo = useDeleteRepo()

  const handleConfirmDelete = () => {
    deleteRepo.mutate(
      repoId,
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: queryKeys.repos.all })
          toast.success('仓库已彻底删除')
          onOpenChange(false)
          onDeleted()
        },
        onError: (error) => {
          toast.error(error instanceof Error ? error.message : '删除失败，请重试')
        },
      }
    )
  }

  return (
    <AlertDialog open={open} onOpenChange={(newOpen) => {
      if (deleteRepo.isPending) return
      onOpenChange(newOpen)
    }}>
      <AlertDialogContent className="sm:max-w-106.25">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-left">确认删除仓库</AlertDialogTitle>
          <AlertDialogDescription className="text-left">
            您即将删除仓库 <span className="font-semibold text-foreground">{repoName}</span>。此操作将删除所有缓存的文件、版本数据和数据库记录，所有数据将永久丢失！
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-row gap-3 sm:justify-end">
          <AlertDialogCancel
            disabled={deleteRepo.isPending}
            className="flex-1 sm:flex-initial sm:min-w-25"
          >
            取消
          </AlertDialogCancel>
          <button
            onClick={handleConfirmDelete}
            disabled={deleteRepo.isPending}
            className={cn(
              buttonVariants(),
              "flex-1 sm:flex-initial sm:min-w-25",
              "border border-red-300 bg-transparent text-red-600 hover:bg-red-50 hover:border-red-400 dark:border-red-800/60 dark:text-red-400 dark:hover:bg-red-950/50"
            )}
          >
            {deleteRepo.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                删除中...
              </>
            ) : (
              <>
                <Trash2 className="mr-2 h-4 w-4" />
                确认删除
              </>
            )}
          </button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
