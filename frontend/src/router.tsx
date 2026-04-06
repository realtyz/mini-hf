import type { RouteObject } from 'react-router'
import LandingLayout from './layouts/LandingLayout'
import LandingPage from './pages'
import AuthPage from './pages/AuthPage'
import DocsPage from './pages/docs'
import Repositories from './pages/Repositories'
import TasksPublic from './pages/TasksPublic'
import ConsoleLayout from './layouts/ConsoleLayout'
import Dashboard from './pages/console/Dashboard'
import RepositoriesConsole from './pages/console/Repositories'
import RepositoryDetail from './pages/console/RepositoryDetail'
import Tasks from './pages/console/Tasks'
import Settings from './pages/console/Settings'
import Users from './pages/console/Users'
import { ProtectedRoute } from './components/auth'

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
        element: <Dashboard />,
      },
      {
        path: 'repositories',
        children: [
          { index: true, element: <RepositoriesConsole /> },
          { path: 'detail', element: <RepositoryDetail /> },
        ],
      },
      {
        path: 'tasks',
        element: <Tasks />,
      },
      {
        path: 'settings',
        element: <Settings />,
      },
      {
        path: 'users',
        element: (
          <ProtectedRoute requiredRole="admin">
            <Users />
          </ProtectedRoute>
        ),
      },
    ],
  },
]
