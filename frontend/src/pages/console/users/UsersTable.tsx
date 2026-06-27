import {
  GripHorizontal,
  Pencil,
  KeyRound,
  Trash2,
  Calendar,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn, formatDateTime } from "@/lib/utils";
import type { UserResponse } from "@/lib/api/types";
import { avatarColor, getInitials } from "./user-avatar";

interface UsersTableProps {
  users: UserResponse[];
  onEdit: (user: UserResponse) => void;
  onResetPassword: (user: UserResponse) => void;
  onDelete: (user: UserResponse) => void;
}

export function UsersTable({
  users,
  onEdit,
  onResetPassword,
  onDelete,
}: UsersTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="bg-muted/30 hover:bg-muted/30 border-b border-border/50">
          <TableHead className="w-14 pl-5 text-center">
            <span className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground select-none">
              ID
            </span>
          </TableHead>
          <TableHead className="pl-4">
            <span className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground select-none">
              用户名
            </span>
          </TableHead>
          <TableHead>
            <span className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground select-none">
              邮箱
            </span>
          </TableHead>
          <TableHead className="w-22.5 text-center">
            <span className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground select-none">
              角色
            </span>
          </TableHead>
          <TableHead className="w-20 text-center">
            <span className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground select-none">
              状态
            </span>
          </TableHead>
          <TableHead className="w-37.5 text-center">
            <span className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground select-none">
              <span className="inline-flex items-center gap-1">
                <Calendar className="size-3" />
                创建时间
              </span>
            </span>
          </TableHead>
          <TableHead className="w-37.5 text-center">
            <span className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground select-none">
              <span className="inline-flex items-center gap-1">
                <Calendar className="size-3" />
                更新时间
              </span>
            </span>
          </TableHead>
          <TableHead className="w-10 pr-5" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {users.map((user, i) => (
          <TableRow
            key={user.id}
            className="group border-b border-border/30 last:border-0 transition-all duration-150 hover:bg-muted/20"
            style={{
              animationDelay: `${i * 0.02}s`,
            }}
          >
            <TableCell className="py-3 pl-5 text-center">
              <span className="font-mono text-[12px] text-muted-foreground/60 tabular-nums">
                {user.id}
              </span>
            </TableCell>
            <TableCell className="text-[13px] py-3 pl-4">
              <div className="flex items-center gap-2.5">
                <Avatar className="size-8 shrink-0 border-2 border-background shadow-sm">
                  <AvatarFallback
                    className={cn(
                      "text-[10px] font-medium text-white",
                      avatarColor(user.id),
                    )}
                  >
                    {getInitials(user.name)}
                  </AvatarFallback>
                </Avatar>
                <span className="font-medium text-foreground/80">
                  {user.name}
                </span>
              </div>
            </TableCell>
            <TableCell className="text-[13px] py-3 text-muted-foreground/70">
              {user.email}
            </TableCell>
            <TableCell className="py-3 text-center">
              <Badge
                variant={user.role === "admin" ? "secondary" : "outline"}
                className={cn(
                  "text-[11px] font-medium rounded-lg px-2.5 py-0.5",
                  user.role === "admin"
                    ? "bg-violet-50 text-violet-700 border-violet-200/50 dark:bg-violet-950/30 dark:text-violet-300 dark:border-violet-800/40"
                    : "bg-slate-100 text-slate-600 border-slate-200/50 dark:bg-slate-800/50 dark:text-slate-300 dark:border-slate-700/50",
                )}
              >
                {user.role === "admin" ? "管理员" : "普通用户"}
              </Badge>
            </TableCell>
            <TableCell className="py-3 text-center">
              {user.is_active ? (
                <Badge
                  className={cn(
                    "text-[11px] font-medium rounded-lg px-2.5 py-0.5",
                    "bg-emerald-50 text-emerald-700 border-emerald-200/50 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-800/40",
                  )}
                >
                  <span className="mr-1.5 size-1.5 rounded-full bg-emerald-500 inline-block" />
                  激活
                </Badge>
              ) : (
                <Badge
                  className={cn(
                    "text-[11px] font-medium rounded-lg px-2.5 py-0.5",
                    "bg-slate-100 text-slate-500 border-slate-200/50 dark:bg-slate-800/40 dark:text-slate-400 dark:border-slate-700/40",
                  )}
                >
                  <span className="mr-1.5 size-1.5 rounded-full bg-slate-400 inline-block" />
                  停用
                </Badge>
              )}
            </TableCell>
            <TableCell className="text-[13px] text-muted-foreground/60 py-3 text-center tabular-nums">
              {formatDateTime(user.created_at)}
            </TableCell>
            <TableCell className="text-[13px] text-muted-foreground/60 py-3 text-center tabular-nums">
              {formatDateTime(user.updated_at)}
            </TableCell>
            <TableCell className="py-3 pr-5">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 opacity-0 group-hover:opacity-100 transition-all duration-150 rounded-lg"
                  >
                    <GripHorizontal className="size-3.5 text-muted-foreground/60" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="w-40 rounded-xl"
                  sideOffset={4}
                >
                  <DropdownMenuItem
                    onClick={() => onEdit(user)}
                    className="text-[13px] cursor-pointer rounded-lg"
                  >
                    <Pencil className="size-3.5 mr-2.5" />
                    编辑
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => onResetPassword(user)}
                    className="text-[13px] cursor-pointer rounded-lg"
                  >
                    <KeyRound className="size-3.5 mr-2.5" />
                    重置密码
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => onDelete(user)}
                    className="text-[13px] cursor-pointer text-destructive focus:text-destructive rounded-lg"
                  >
                    <Trash2 className="size-3.5 mr-2.5" />
                    删除
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
