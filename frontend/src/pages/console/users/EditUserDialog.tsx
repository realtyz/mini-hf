import { useState } from "react";
import {
  RefreshCw,
  Shield,
  User,
  Mail,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { useUpdateUser } from "@/hooks/api/use-user-queries";
import type { UserResponse, UserRole } from "@/lib/api/types";

interface EditUserDialogProps {
  user: UserResponse | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

export function EditUserDialog({
  user,
  open,
  onOpenChange,
}: EditUserDialogProps) {
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [role, setRole] = useState<UserRole>(
    (user?.role as UserRole) ?? "user",
  );
  const [isActive, setIsActive] = useState(user?.is_active ?? true);
  const { mutate: updateUser, isPending } = useUpdateUser();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    updateUser(
      { userId: user.id, data: { name, email, role, is_active: isActive } },
      {
        onSuccess: () => {
          toast.success("用户信息已更新");
          onOpenChange(false);
        },
        onError: (error: Error) => {
          toast.error("更新失败", {
            description: error.message || "请稍后重试",
          });
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold tracking-tight">
            编辑用户
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-5 pt-2">
          <div className="space-y-2.5">
            <Label htmlFor="edit-name" className="text-sm font-medium">
              姓名
            </Label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="edit-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="pl-10"
              />
            </div>
          </div>
          <div className="space-y-2.5">
            <Label htmlFor="edit-email" className="text-sm font-medium">
              邮箱
            </Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="edit-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="pl-10"
              />
            </div>
          </div>
          <div className="space-y-2.5">
            <Label className="text-sm font-medium">角色</Label>
            <Select value={role} onValueChange={(v) => setRole(v as UserRole)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="user">
                  <div className="flex items-center gap-2">
                    <User className="h-3.5 w-3.5" />
                    普通用户
                  </div>
                </SelectItem>
                <SelectItem value="admin">
                  <div className="flex items-center gap-2">
                    <Shield className="h-3.5 w-3.5" />
                    管理员
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between rounded-xl border bg-muted/30 px-4 py-3">
            <div className="flex items-center gap-3">
              <div
                className={`flex h-9 w-9 items-center justify-center rounded-lg ${isActive ? "bg-emerald-100 text-emerald-600" : "bg-slate-100 text-slate-500"
                  }`}
              >
                {isActive ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <AlertCircle className="h-4 w-4" />
                )}
              </div>
              <div>
                <p className="text-sm font-medium">账号状态</p>
                <p className="text-xs text-muted-foreground">
                  {isActive ? "用户可正常访问系统" : "用户已被停用"}
                </p>
              </div>
            </div>
            <Switch
              id="edit-active"
              checked={isActive}
              onCheckedChange={setIsActive}
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
                "保存"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
