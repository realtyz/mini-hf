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
import { toast } from "sonner";
import { useCreateUser } from "@/hooks/api/use-user-queries";
import type { UserRole } from "@/lib/api/types";

interface CreateUserDialogProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

export function CreateUserDialog({
  open,
  onOpenChange,
}: CreateUserDialogProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("user");
  const { mutate: createUser, isPending } = useCreateUser();

  const reset = () => {
    setName("");
    setEmail("");
    setPassword("");
    setRole("user");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createUser(
      { name, email, password, role },
      {
        onSuccess: () => {
          toast.success("用户创建成功", {
            description: `${name} 已添加到系统中`,
            icon: <CheckCircle2 className="h-4 w-4" />,
          });
          onOpenChange(false);
          reset();
        },
        onError: (error: Error) => {
          toast.error("创建失败", {
            description: error.message || "请稍后重试",
            icon: <AlertCircle className="h-4 w-4" />,
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
            新建用户
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-5 pt-2">
          <div className="space-y-2.5">
            <Label htmlFor="create-name" className="text-sm font-medium">
              姓名
            </Label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="create-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="输入用户姓名"
                className="pl-10"
              />
            </div>
          </div>
          <div className="space-y-2.5">
            <Label htmlFor="create-email" className="text-sm font-medium">
              邮箱
            </Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="create-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="user@example.com"
                className="pl-10"
              />
            </div>
          </div>
          <div className="space-y-2.5">
            <Label htmlFor="create-password" className="text-sm font-medium">
              密码
            </Label>
            <Input
              id="create-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              placeholder="至少 6 位字符"
            />
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
                "创建"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
