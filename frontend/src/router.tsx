import { lazy, Suspense } from 'react'
import type { RouteObject } from 'react-router'
import LandingLayout from './layouts/LandingLayout'
import LandingPage from './pages'
import AuthPage from './pages/AuthPage'
import DocsPage from './pages/docs'
import Repositories from './pages/Repositories'
import TasksPublic from './pages/TasksPublic'
import ConsoleLayout from './layouts/ConsoleLayout'
import { ProtectedRoute } from './components/auth'

const Dashboard = lazy(() => import('./pages/console/Dashboard'))
const RepositoriesConsole = lazy(() => import('./pages/console/Repositories'))
const RepositoryDetail = lazy(() => import('./pages/console/RepositoryDetail'))
const Tasks = lazy(() => import('./pages/console/Tasks'))
const Settings = lazy(() => import('./pages/console/Settings'))
const Users = lazy(() => import('./pages/console/Users'))
const CacheScan = lazy(() => import('./pages/console/CacheScan'))

function LazyLoad({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    }>
      {children}
    </Suspense>
  )
}

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <LandingLayout />,
    children: [
      {
        index: true,
        element: <LandingPage />,
      },
      {
        path: 'docs',
        element: <DocsPage />,
      },
      {
        path: 'docs/:slug',
        element: <DocsPage />,
      },
      {
        path: 'repositories',
        children: [
          { index: true, element: <Repositories /> },
          { path: 'detail', element: <RepositoryDetail backPath="/repositories" showActions={false} /> },
        ],
      },
      {
        path: 'tasks-public',
        element: <TasksPublic />,
      },
    ],
  },
  {
    path: '/login',
    element: <AuthPage />,
  },
  {
    path: '/register',
    element: <AuthPage />,
  },
  {
    path: '/console',
    element: (
      <ProtectedRoute>
        <ConsoleLayout />
      </ProtectedRoute>
    ),
    children: [
      {
        index: true,
        element: <LazyLoad><Dashboard /></LazyLoad>,
      },
      {
        path: 'repositories',
        children: [
          { index: true, element: <LazyLoad><RepositoriesConsole /></LazyLoad> },
          { path: 'detail', element: <LazyLoad><RepositoryDetail /></LazyLoad> },
        ],
      },
      {
        path: 'tasks',
        element: <LazyLoad><Tasks /></LazyLoad>,
      },
      {
        path: 'cache-scan',
        element: <LazyLoad><CacheScan /></LazyLoad>,
      },
      {
        path: 'settings',
        element: <LazyLoad><Settings /></LazyLoad>,
      },
      {
        path: 'users',
        element: (
          <ProtectedRoute requiredRole="admin">
            <LazyLoad><Users /></LazyLoad>
          </ProtectedRoute>
        ),
      },
    ],
  },
]
