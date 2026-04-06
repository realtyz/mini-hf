/*
 * Console Layout - Data-Dense Dashboard Style
 * 专业管理后台，清晰的数据展示与流畅的交互体验
 */

import { Outlet, Link, useLocation, useNavigate } from "react-router";
import { useMemo } from "react";
import {
  LayoutDashboard,
  Box,
  ListTodo,
  Settings,
  Home,
  Users,
  LogOut,
  Sun,
  Moon,
  Monitor,
  ChevronRight,
  BookOpen,
  Boxes,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuGroup,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuShortcut,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { useCurrentUser } from "@/hooks/api/use-auth-queries";
import { useAuthStore } from "@/stores/auth-store";
import { useTheme } from "@/components/theme-provider";
import { queryClient } from "@/lib/query-client";

// =============================================================================
// Types & Interfaces
// =============================================================================

interface MenuItem {
  title: string;
  path: string;
  icon: LucideIcon;
  exact?: boolean;
  badge?: string | number;
  description?: string;
}

interface MenuGroup {
  label: string;
  items: MenuItem[];
}

// =============================================================================
// Configuration - 中文菜单配置
// =============================================================================

const menuGroups: MenuGroup[] = [
  {
    label: "工作区",
    items: [
      {
        title: "仪表盘",
        path: "/console",
        icon: LayoutDashboard,
        exact: true,
        description: "系统概览与统计数据",
      },
      {
        title: "仓库管理",
        path: "/console/repositories",
        icon: Box,
        description: "管理模型与数据集缓存",
      },
      {
        title: "任务中心",
        path: "/console/tasks",
        icon: ListTodo,
        description: "下载与同步任务",
      },
    ],
  },
  {
    label: "系统管理",
    items: [
      {
        title: "用户管理",
        path: "/console/users",
        icon: Users,
        description: "用户权限与角色配置",
      },
      {
        title: "系统设置",
        path: "/console/settings",
        icon: Settings,
        description: "系统参数与配置",
      },
    ],
  },
];

// =============================================================================
// Utility Functions
// =============================================================================

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function useIsActive(path: string, exact?: boolean) {
  const location = useLocation();
  if (exact) {
    return location.pathname === path;
  }
  return location.pathname.startsWith(path);
}

// =============================================================================
// Components
// =============================================================================

/**
 * Logo 组件 - 简洁SVG设计，hover时放大并显示光晕
 */
function Logo({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <Link
      to="/console"
      className={cn(
        "group/logo relative flex items-center",
        collapsed ? "justify-center" : "gap-3"
      )}
    >
      {/* Logo SVG - 悬停时放大+光晕效果 */}
      <div className="relative flex h-8 w-8 shrink-0 items-center justify-center transition-all duration-300 group-hover/logo:scale-110">
        {/* 光晕背景 */}
        <div className="absolute inset-0 rounded-full bg-primary/20 opacity-0 blur-lg transition-opacity duration-300 group-hover/logo:opacity-100" />
        {/* SVG Logo - 内联使用以支持 currentColor */}
        <svg
          viewBox="0 0 32 32"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="relative h-7 w-7 text-foreground drop-shadow-sm transition-all duration-300 group-hover/logo:drop-shadow-md"
        >
          {/* 外层立方体 - 代表缓存存储 */}
          <path d="M16 2L4 9V23L16 30L28 23V9L16 2Z" fill="currentColor" opacity="0.15" />
          <path d="M16 2L4 9V23L16 30L28 23V9L16 2Z" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          {/* 内层立方体线条 */}
          <path d="M16 17V30" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M16 17L4 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M16 17L28 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          {/* 中心节点 - 代表 AI 模型 */}
          <circle cx="16" cy="17" r="3" fill="currentColor" />
          {/* 连接线 - 代表神经网络 */}
          <line x1="16" y1="14" x2="16" y2="8" stroke="currentColor" strokeWidth="1" />
          <line x1="18.5" y1="18.5" x2="23" y2="21" stroke="currentColor" strokeWidth="1" />
          <line x1="13.5" y1="18.5" x2="9" y2="21" stroke="currentColor" strokeWidth="1" />
          {/* 小节点 */}
          <circle cx="16" cy="8" r="1.5" fill="currentColor" opacity="0.6" />
          <circle cx="23" cy="21" r="1.5" fill="currentColor" opacity="0.6" />
          <circle cx="9" cy="21" r="1.5" fill="currentColor" opacity="0.6" />
        </svg>
      </div>
      {/* 文字 - 展开时显示 */}
      <div className={cn(
        "flex flex-col transition-all duration-200 overflow-hidden",
        collapsed ? "w-0 opacity-0" : "w-auto opacity-100"
      )}>
        <span className="text-sm font-semibold tracking-tight text-foreground whitespace-nowrap">Mini-HF</span>
        <span className="text-xs text-muted-foreground whitespace-nowrap">模型缓存中心</span>
      </div>
    </Link>
  );
}

/**
 * 文档链接按钮
 */
function DocsLink() {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors duration-200"
            asChild
          >
            <Link to="/docs" aria-label="使用文档">
              <BookOpen className="h-4 w-4" />
            </Link>
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" align="center">
          <p className="text-xs">使用文档</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * 仓库列表链接按钮
 */
function ReposLink() {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors duration-200"
            asChild
          >
            <Link to="/repositories" aria-label="仓库列表">
              <Boxes className="h-4 w-4" />
            </Link>
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" align="center">
          <p className="text-xs">仓库列表</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * 主题切换按钮
 */
function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const nextTheme = theme === "light" ? "dark" : theme === "dark" ? "system" : "light";

  const icons = {
    light: Sun,
    dark: Moon,
    system: Monitor,
  };
  const Icon = icons[theme];
  const labels = { light: "浅色", dark: "深色", system: "跟随系统" };

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent cursor-pointer transition-colors duration-200"
            onClick={() => setTheme(nextTheme)}
            aria-label="切换主题"
          >
            <Icon className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" align="center">
          <p className="text-xs">主题: {labels[theme]}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * 用户下拉菜单
 */
function UserDropdown({ collapsed = false }: { collapsed?: boolean }) {
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
          className={cn(
            "relative flex items-center gap-2.5 rounded-lg p-1.5 pr-3 hover:bg-accent transition-colors duration-200",
            collapsed && "h-9 w-9 justify-center p-0"
          )}
          aria-label="用户菜单"
        >
          <Avatar className="h-8 w-8 shrink-0">
            <AvatarFallback className="bg-primary/15 text-primary text-xs font-semibold">
              {userInitials}
            </AvatarFallback>
          </Avatar>
          {!collapsed && (
            <>
              <div className="flex flex-col items-start text-left md:flex">
                <span className="text-xs font-medium leading-none">
                  {userName}
                </span>
                <span className="text-[11px] text-muted-foreground leading-none mt-0.5">
                  {userRole}
                </span>
              </div>
            </>
          )}
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
        <DropdownMenuItem asChild className="cursor-pointer">
          <Link to="/">
            <Home className="mr-2 h-4 w-4" />
            返回首页
          </Link>
        </DropdownMenuItem>
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
        {user?.role === "admin" && (
          <DropdownMenuGroup>
            <DropdownMenuItem asChild className="cursor-pointer">
              <Link to="/console/settings">
                <Settings className="mr-2 h-4 w-4" />
                系统设置
                <DropdownMenuShortcut>⌘,</DropdownMenuShortcut>
              </Link>
            </DropdownMenuItem>
          </DropdownMenuGroup>
        )}
        {user?.role === "admin" && <DropdownMenuSeparator />}
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

/**
 * 导航项组件 - 精细的交互效果
 */
function NavItem({ item }: { item: MenuItem }) {
  const isActive = useIsActive(item.path, item.exact);
  const Icon = item.icon;

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        isActive={isActive}
        tooltip={item.title}
        className={cn(
          "group/menu-button relative overflow-hidden rounded-lg py-2 transition-all duration-200",
          "hover:bg-accent hover:text-accent-foreground",
          isActive && "bg-accent/80 text-accent-foreground font-medium"
        )}
      >
        <Link to={item.path} viewTransition className="relative">
          {/* 激活指示线 */}
          <div
            className={cn(
              "absolute left-0 top-1/2 h-5 w-0.75 -translate-y-1/2 rounded-r-full bg-primary transition-all duration-300",
              isActive ? "opacity-100 scale-100" : "opacity-0 scale-0"
            )}
          />
          <Icon
            className={cn(
              "relative z-10 h-4.5 w-4.5 shrink-0 transition-transform duration-200",
              isActive ? "text-primary" : "text-muted-foreground group-hover/menu-button:text-foreground"
            )}
          />
          <span className="relative z-10 truncate text-sm">{item.title}</span>
          {item.badge && (
            <Badge className="ml-auto h-5 min-w-5 px-1.5 text-[10px] font-semibold bg-primary/15 text-primary border-0">
              {item.badge}
            </Badge>
          )}
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

/**
 * 版本与版权信息
 */
function VersionInfo() {
  const version = import.meta.env.VITE_APP_VERSION || '1.0.0';
  const copyright = import.meta.env.VITE_APP_COPYRIGHT || '© 2025 Mini-HF Team';

  return (
    <div className="rounded-lg bg-muted/40 border border-border/50 p-3 group-data-[collapsible=icon]:hidden">
      <div className="flex flex-col gap-1 text-center">
        <span className="text-xs font-medium text-muted-foreground">
          Mini-HF v{version}
        </span>
        <span className="text-[11px] text-muted-foreground/70">
          {copyright}
        </span>
      </div>
    </div>
  );
}

/**
 * 控制台侧边栏组件
 */
function ConsoleSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { user } = useAuthStore();

  // 根据角色过滤菜单
  const filteredMenuGroups = useMemo(() => {
    if (user?.role === 'admin') {
      return menuGroups; // 管理员可见所有菜单
    }
    // 普通用户只能看到仪表盘和任务中心
    return menuGroups.map(group => ({
      ...group,
      items: group.items.filter(item =>
        item.path === '/console' || item.path === '/console/tasks'
      ),
    })).filter(group => group.items.length > 0);
  }, [user?.role]);

  return (
    <Sidebar
      collapsible="icon"
      className="border-r border-border"
    >
      {/* 侧边栏头部 - Logo */}
      <SidebarHeader className={cn(
        "transition-all duration-200",
        collapsed ? "p-2" : "p-4"
      )}>
        <Logo collapsed={collapsed} />
      </SidebarHeader>
      <SidebarContent className="gap-6 px-3 py-4">
        {filteredMenuGroups.map((group) => (
          <SidebarGroup key={group.label} className="p-0">
            <SidebarGroupLabel className="px-3 pb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">
              {group.label}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="gap-1">
                {group.items.map((item) => (
                  <NavItem key={item.path} item={item} />
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      {/* 侧边栏底部 - 版本信息 */}
      <SidebarFooter className="p-3 border-t border-border">
        <VersionInfo />
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}

/**
 * 面包屑导航
 */
function BreadcrumbNav() {
  const location = useLocation();

  // 根据路径生成面包屑
  const pathSegments = location.pathname.split('/').filter(Boolean);
  const breadcrumbMap: Record<string, string> = {
    console: "控制台",
    repositories: "仓库管理",
    tasks: "任务中心",
    users: "用户管理",
    settings: "系统设置",
  };

  // 获取当前页面标题
  const currentPage = pathSegments[pathSegments.length - 1] || 'console';
  const currentPageTitle = breadcrumbMap[currentPage] || "控制台";

  return (
    <nav className="hidden md:flex items-center gap-1.5 text-sm text-muted-foreground">
      <Link
        to="/console"
        className="hover:text-foreground transition-colors duration-200"
      >
        控制台
      </Link>
      {pathSegments.length > 1 && (
        <>
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50" />
          <span className="font-medium text-foreground">{currentPageTitle}</span>
        </>
      )}
    </nav>
  );
}

/**
 * 控制台头部组件
 */
function ConsoleHeader() {
  return (
    <header
      className={cn(
        "sticky top-0 z-40 flex h-16 items-center gap-4 border-b border-border bg-background/95 px-4 lg:px-6 backdrop-blur-sm",
        "transition-[width,height] duration-200 ease-linear",
        "group-has-data-[collapsible=icon]/sidebar-wrapper:h-14"
      )}
    >
      {/* 左侧区域 */}
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <SidebarTrigger className="h-8 w-8 rounded-lg" />
        <Separator orientation="vertical" className="h-5 hidden sm:block" />
        <BreadcrumbNav />
      </div>

      {/* 右侧区域 */}
      <div className="flex items-center gap-1.5">
        <DocsLink />
        <ReposLink />
        <div className="h-5 w-px bg-border mx-0.5 hidden sm:block" />
        <ThemeToggle />
        <div className="h-5 w-px bg-border mx-0.5 hidden sm:block" />
        <UserDropdown />
      </div>
    </header>
  );
}

// =============================================================================
// Main Layout Component
// =============================================================================

export function ConsoleLayout() {
  useCurrentUser();

  return (
    <SidebarProvider defaultOpen={true}>
      <ConsoleSidebar />
      <SidebarInset className="bg-muted/30 min-h-screen">
        <ConsoleHeader />
        <main className="flex-1">
          <div className="mx-auto max-w-7xl p-5 lg:p-8">
            <Outlet />
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}

export default ConsoleLayout;
