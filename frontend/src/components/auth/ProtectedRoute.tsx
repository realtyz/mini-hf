/**
 * ProtectedRoute - 受保护路由组件
 *
 * 功能：
 * 1. 检查用户是否已认证（有 token）
 * 2. 获取当前用户信息
 * 3. 支持角色验证（可选）
 * 4. 显示加载状态
 * 5. 未认证时重定向到登录页
 */

import { Navigate, useLocation } from 'react-router'
import { useCurrentUser } from '@/hooks/api/use-auth-queries'
import { useAuthStore } from '@/stores/auth-store'
import { Loader2 } from 'lucide-react'

interface ProtectedRouteProps {
  children: React.ReactNode
  requiredRole?: 'admin' | 'user'
  fallback?: React.ReactNode
}

/**
 * 加载状态组件
 */
function LoadingState() {
  return (
    <div className="flex h-screen w-full items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">加载中...</p>
      </div>
    </div>
  )
}

/**
 * 无权限组件
 */
function ForbiddenState() {
  return (
    <div className="flex h-screen w-full items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-destructive">403</h1>
        <p className="mt-2 text-muted-foreground">您没有权限访问此页面</p>
      </div>
    </div>
  )
}

/**
 * ProtectedRoute 组件
 *
 * 使用方式：
 * ```tsx
 * <Route path="/console" element={<ProtectedRoute><ConsoleLayout /></ProtectedRoute>} />
 * <Route path="/admin" element={<ProtectedRoute requiredRole="admin"><AdminPage /></ProtectedRoute>} />
 * ```
 */
export function ProtectedRoute({
  children,
  requiredRole,
  fallback,
}: ProtectedRouteProps) {
  const location = useLocation()
  const { isAuthenticated, token } = useAuthStore()

  // 使用 React Query 获取当前用户信息（自动处理缓存）
  const { isLoading, error } = useCurrentUser()

  // 未认证：重定向到登录页
  if (!isAuthenticated || !token) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  // 加载中：显示加载状态
  if (isLoading) {
    if (fallback) {
      return <>{fallback}</>
    }
    return <LoadingState />
  }

  // 获取用户信息失败：可能是 token 失效
  if (error) {
    // 错误已经在 API 拦截器中处理（会跳转登录）
    // 这里显示加载状态等待跳转
    return <LoadingState />
  }

  // 获取用户 store 中的信息（已通过 useCurrentUser 填充）
  const { user } = useAuthStore.getState()

  // 角色验证
  if (requiredRole && user?.role !== requiredRole) {
    return <ForbiddenState />
  }

  // 验证通过，渲染子组件
  return <>{children}</>
}

export default ProtectedRoute
