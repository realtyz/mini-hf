import {
  Menu,
  X,
  BookOpen,
  Database,
  ListOrdered,
  Settings,
  LogOut,
  Sun,
  Moon,
  Monitor,
  Home,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Logo } from "@/components/shared/Logo";
import { ThemeToggle } from "@/components/shared/ThemeToggle";
import { landingContent } from "@/constants/landing";
import { useAuthStore } from "@/stores/auth-store";
import { useCurrentUser } from "@/hooks/api/use-auth-queries";
import { useTheme } from "@/components/theme-provider";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { queryClient } from "@/lib/query-client";

const iconMap: Record<string, LucideIcon> = {
  BookOpen,
  Database,
  ListOrdered,
};

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

interface UserDropdownProps {
  isInConsole?: boolean;
}

/**
 * 用户下拉菜单 - 参照 ConsoleLayout 样式
 */
function UserDropdown({ isInConsole = false }: UserDropdownProps) {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const { theme, setTheme } = useTheme();

  const handleLogout = () => {
    logout();
    // 清除 React Query 缓存，避免用户数据残留在内存中
    queryClient.clear();
    navigate("/login");
  };

  const userInitials = user?.name ? getInitials(user.name) : "U";
  const userName = user?.name ?? "用户";
  const userEmail = user?.email ?? "";
  const userRole = user?.role === "admin" ? "管理员" : "用户";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="relative flex items-center gap-2.5 rounded-lg p-1.5 pr-3 hover:bg-accent transition-colors duration-200"
          aria-label="用户菜单"
        >
          <Avatar className="h-8 w-8 shrink-0">
            <AvatarFallback className="bg-primary/15 text-primary text-xs font-semibold">
              {userInitials}
            </AvatarFallback>
          </Avatar>
          <div className="hidden md:flex flex-col items-start text-left">
            <span className="text-xs font-medium leading-none">
              {userName}
            </span>
            <span className="text-[11px] text-muted-foreground leading-none mt-0.5">
              {userRole}
            </span>
          </div>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none">{userName}</p>
            <p className="text-xs leading-none text-muted-foreground">
              {userEmail}
            </p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          {isInConsole ? (
            <DropdownMenuItem asChild className="cursor-pointer">
              <Link to="/">
                <Home className="mr-2 h-4 w-4" />
                回到首页
              </Link>
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem asChild className="cursor-pointer">
              <Link to="/console">
                <Settings className="mr-2 h-4 w-4" />
                控制台
              </Link>
            </DropdownMenuItem>
          )}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-xs text-muted-foreground">
            主题
          </DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={theme}
            onValueChange={(v) => setTheme(v as "light" | "dark" | "system")}
          >
            <DropdownMenuRadioItem value="light" className="text-xs cursor-pointer">
              <Sun className="mr-2 h-3.5 w-3.5" />
              浅色
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="dark" className="text-xs cursor-pointer">
              <Moon className="mr-2 h-3.5 w-3.5" />
              深色
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="system" className="text-xs cursor-pointer">
              <Monitor className="mr-2 h-3.5 w-3.5" />
              跟随系统
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={handleLogout}
          className="text-destructive focus:text-destructive cursor-pointer"
        >
          <LogOut className="mr-2 h-4 w-4" />
          退出登录
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface HeaderProps {
  variant?: "landing" | "docs";
  onMenuClick?: () => void;
  isMenuOpen?: boolean;
}

export function Header({
  variant = "landing",
  onMenuClick,
  isMenuOpen,
}: HeaderProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { isAuthenticated, user } = useAuthStore();
  const location = useLocation();

  // 确保用户信息已加载（刷新后从 API 获取）
  useCurrentUser();

  const isDocs = variant === "docs";
  const isInConsole = location.pathname.startsWith("/console");

  const isActive = (href: string) => {
    if (href === "/") {
      return location.pathname === "/";
    }
    return location.pathname.startsWith(href);
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/50 bg-background/80 backdrop-blur-xl supports-backdrop-filter:bg-background/60">
      <div className="mx-auto flex h-16 max-w-7xl items-center px-4 sm:px-6 lg:px-8">
        {/* Left Side */}
        <div className="flex items-center gap-4">
          {isDocs && onMenuClick && (
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden -ml-2 hover:bg-accent/80 transition-colors duration-200"
              onClick={onMenuClick}
            >
              {isMenuOpen ? (
                <X className="size-5" />
              ) : (
                <Menu className="size-5" />
              )}
            </Button>
          )}
          <Link to="/" viewTransition className="shrink-0 group">
            <Logo />
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-1 text-sm font-medium ml-8">
            {landingContent.header.navigation.map((item) => {
              const Icon = iconMap[item.icon];
              const active = isActive(item.href);
              const handleClick = (e: React.MouseEvent) => {
                if (active) {
                  e.preventDefault();
                }
              };
              return (
                <Link
                  key={item.href}
                  to={item.href}
                  viewTransition
                  onClick={handleClick}
                  className={`relative flex items-center gap-2 rounded-lg px-4 py-2 transition-all duration-200 ease-out ${
                    active
                      ? "text-primary font-semibold"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                  }`}
                >
                  {active && (
                    <span className="absolute inset-0 rounded-lg bg-primary/10 shadow-sm transition-all duration-200" />
                  )}
                  <span className="relative flex items-center gap-2">
                    {Icon && (
                      <Icon className="size-4 transition-transform duration-200 group-hover:scale-110" />
                    )}
                    {item.label}
                  </span>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Right Side Actions */}
        <div className="flex items-center gap-3 ml-auto">
          <ThemeToggle />

          <div className="h-6 w-px bg-linear-to-b from-transparent via-border to-transparent" />

          {/* Desktop User Section */}
          {isAuthenticated ? (
            <UserDropdown isInConsole={isInConsole} />
          ) : (
            <Button variant="secondary" asChild>
              <Link to="/login" viewTransition>
                登录 / 注册
              </Link>
            </Button>
          )}

          {/* Mobile Navigation */}
          <Sheet open={isOpen} onOpenChange={setIsOpen}>
            <SheetTrigger asChild className="md:hidden">
              <Button
                variant="ghost"
                size="icon"
                className="-mr-2 hover:bg-accent/80 transition-colors duration-200"
              >
                {isOpen ? <X /> : <Menu />}
                <span className="sr-only">切换菜单</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-70 sm:w-80">
              <nav className="flex flex-col gap-2 mt-4">
                {landingContent.header.navigation.map((item) => {
                  const Icon = iconMap[item.icon];
                  const active = isActive(item.href);
                  const handleClick = (e: React.MouseEvent) => {
                    if (active) {
                      e.preventDefault();
                    } else {
                      setIsOpen(false);
                    }
                  };
                  return (
                    <Link
                      key={item.href}
                      to={item.href}
                      className={`flex items-center gap-3 text-base font-medium rounded-lg px-4 py-3 transition-all duration-200 ${
                        active
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                      }`}
                      onClick={handleClick}
                      viewTransition
                    >
                      {Icon && (
                        <Icon
                          className={`size-5 ${active ? "text-primary-foreground" : ""}`}
                        />
                      )}
                      {item.label}
                    </Link>
                  );
                })}
                <div className="h-px bg-border my-2" />
                {isAuthenticated ? (
                  <div className="flex flex-col gap-3 p-2">
                    {/* 用户信息卡片 */}
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                      <Avatar className="h-10 w-10 shrink-0">
                        <AvatarFallback className="bg-primary/15 text-primary text-sm font-semibold">
                          {user?.name ? getInitials(user.name) : "U"}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex flex-col min-w-0">
                        <span className="text-sm font-medium truncate">
                          {user?.name || "用户"}
                        </span>
                        <span className="text-xs text-muted-foreground truncate">
                          {user?.email || ""}
                        </span>
                      </div>
                    </div>
                    {/* 操作按钮 */}
                    <Button className="w-full cursor-pointer shadow-sm" asChild>
                      {isInConsole ? (
                        <Link to="/" onClick={() => setIsOpen(false)}>
                          <Home className="h-4 w-4 mr-2" />
                          回到首页
                        </Link>
                      ) : (
                        <Link to="/console" onClick={() => setIsOpen(false)}>
                          <Settings className="h-4 w-4 mr-2" />
                          控制台
                        </Link>
                      )}
                    </Button>
                  </div>
                ) : (
                  <Button className="w-full cursor-pointer shadow-sm" asChild>
                    <Link to="/login" onClick={() => setIsOpen(false)}>
                      {landingContent.header.cta}
                    </Link>
                  </Button>
                )}
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
