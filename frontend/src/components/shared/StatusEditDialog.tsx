import { useState } from 'react'
import { Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface StatusOption {
  value: string
  label: string
}

interface StatusEditDialogProps {
  /** The current status value */
  currentStatus: string
  /** Available status options to choose from */
  options: StatusOption[]
  /** Display label for the entity being modified (e.g. "仓库状态", "版本状态") */
  entityLabel: string
  /** Called when the user confirms the new status */
  onConfirm: (newStatus: string) => void
  /** Whether the mutation is pending */
  isPending?: boolean
}

export function StatusEditDialog({
  currentStatus,
  options,
  entityLabel,
  onConfirm,
  isPending = false,
}: StatusEditDialogProps) {
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<string>('')

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setSelected('')
    }
    setOpen(nextOpen)
  }

  const handleConfirm = () => {
    if (!selected || selected === currentStatus) return
    onConfirm(selected)
    setOpen(false)
  }

  const currentLabel = options.find((o) => o.value === currentStatus)?.label ?? currentStatus

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <button
          className="inline-flex items-center justify-center rounded p-0.5 text-muted-foreground/40 hover:text-muted-foreground hover:bg-accent transition-colors cursor-pointer"
          title={`修改${entityLabel}`}
        >
          <Pencil className="size-3" />
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[360px]">
        <DialogHeader>
          <DialogTitle>修改{entityLabel}</DialogTitle>
          <DialogDescription>
            当前状态：<span className="font-medium text-foreground">{currentLabel}</span>
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <Select value={selected} onValueChange={setSelected}>
            <SelectTrigger>
              <SelectValue placeholder="选择新状态..." />
            </SelectTrigger>
            <SelectContent>
              {options.map((opt) => (
                <SelectItem
                  key={opt.value}
                  value={opt.value}
                  disabled={opt.value === currentStatus}
                >
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
            取消
          </Button>
          <Button
            size="sm"
            onClick={handleConfirm}
            disabled={!selected || selected === currentStatus || isPending}
          >
            确认修改
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
