import { CheckCircle2, Loader2, RotateCcw, Save } from "lucide-react";
import { Button } from "@/components/ui/button";

// Save-state indicator (private to ActionsFooter).
function ChangeIndicator({ hasChanges }: { hasChanges: boolean }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      {hasChanges ? (
        <>
          <span className="relative flex size-2">
            <span className="animate-ping absolute inline-flex size-full rounded-full bg-amber-400 opacity-75" />
            <span className="relative inline-flex rounded-full size-2 bg-amber-500" />
          </span>
          <span className="text-muted-foreground text-xs">有未保存的更改</span>
        </>
      ) : (
        <>
          <CheckCircle2 className="size-4 text-emerald-500" />
          <span className="text-muted-foreground text-xs">所有更改已保存</span>
        </>
      )}
    </div>
  );
}

interface ActionsFooterProps {
  hasChanges: boolean;
  isSaving: boolean;
  onSave: () => void;
  onReset: () => void;
  extra?: React.ReactNode;
}

export function ActionsFooter({
  hasChanges,
  isSaving,
  onSave,
  onReset,
  extra,
}: ActionsFooterProps) {
  return (
    <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <ChangeIndicator hasChanges={hasChanges} />
      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
        {extra}
        {hasChanges && (
          <Button
            variant="outline"
            size="sm"
            onClick={onReset}
            disabled={isSaving}
            className="gap-1.5 h-9"
          >
            <RotateCcw className="size-3.5" />
            重置
          </Button>
        )}
        <Button
          size="sm"
          onClick={onSave}
          disabled={!hasChanges || isSaving}
          className="gap-1.5 h-9"
        >
          {isSaving ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Save className="size-3.5" />
          )}
          保存更改
        </Button>
      </div>
    </div>
  );
}
