import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useResetUserPassword } from "@/hooks/api/use-user-queries";
import type { UserResponse } from "@/lib/api/types";

interface ResetPasswordDialogProps {
  user: UserResponse | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

export function ResetPasswordDialog({
  user,
  open,
  onOpenChange,
}: ResetPasswordDialogProps) {
  const [newPassword, setNewPassword] = useState("");
  const { mutate: resetPassword, isPending } = useResetUserPassword();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    resetPassword(
      { userId: user.id, newPassword },
      {
        onSuccess: () => {
          toast.success("密码重置成功");
          onOpenChange(false);
          setNewPassword("");
        },
        onError: (error: Error) => {
          toast.error("重置失败", {
            description: error.message || "请稍后重试",
          });
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold tracking-tight">
            重置密码
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-5 pt-2">
          <div className="rounded-xl border bg-muted/30 p-4">
            <p className="text-sm text-muted-foreground">目标用户</p>
            <p className="mt-1 font-medium">{user?.name}</p>
            <p className="text-sm text-muted-foreground">{user?.email}</p>
          </div>
          <div className="space-y-2.5">
            <Label htmlFor="new-password" className="text-sm font-medium">
              新密码
            </Label>
            <Input
              id="new-password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={6}
              placeholder="至少 6 位字符"
              autoFocus
            />
          </div>
          <DialogFooter className="gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              取消
            </Button>
            <Button type="submit" disabled={isPending} className="min-w-20">
              {isPending ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                "重置"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
