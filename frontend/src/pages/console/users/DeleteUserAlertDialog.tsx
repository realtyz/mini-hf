import { RefreshCw } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { useDeleteUser } from "@/hooks/api/use-user-queries";
import type { UserResponse } from "@/lib/api/types";

interface DeleteUserAlertDialogProps {
  user: UserResponse | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

export function DeleteUserAlertDialog({
  user,
  open,
  onOpenChange,
}: DeleteUserAlertDialogProps) {
  const { mutate: deleteUser, isPending } = useDeleteUser();

  const handleConfirm = () => {
    if (!user) return;
    deleteUser(user.id, {
      onSuccess: () => {
        toast.success("用户已删除");
        onOpenChange(false);
      },
      onError: (error: Error) => {
        toast.error("删除失败", {
          description: error.message || "请稍后重试",
        });
      },
    });
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="text-xl font-semibold tracking-tight">
            确认删除
          </AlertDialogTitle>
          <AlertDialogDescription className="pt-2">
            确定要删除用户{" "}
            <strong className="text-foreground">{user?.name}</strong> 吗？
            <br />
            <span className="text-muted-foreground">{user?.email}</span>
            <p className="mt-3 text-sm text-destructive">
              此操作不可撤销，用户的所有数据将被永久删除。
            </p>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2">
          <AlertDialogCancel disabled={isPending}>取消</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={isPending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isPending ? (
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            确认删除
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
