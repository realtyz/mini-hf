import { lazy } from "react";
import type { RouteObject } from "react-router";
import LandingLayout from "./layouts/LandingLayout";
import LandingPage from "./pages";
import AuthPage from "./pages/auth";
import DocsPage from "./pages/docs";
import Repositories from "./pages/repositories";
import TasksPublic from "./pages/tasks-public";
import ConsoleLayout from "./layouts/ConsoleLayout";
import { ProtectedRoute } from "./components/auth";
import LazyLoad from "./components/shared/LazyLoad";

const Dashboard = lazy(() => import("./pages/console/dashboard"));
const RepositoriesConsole = lazy(() => import("./pages/console/repositories"));
const RepositoryDetail = lazy(
  () => import("./pages/console/repository-detail"),
);
const Tasks = lazy(() => import("./pages/console/tasks"));
const Settings = lazy(() => import("./pages/console/settings"));
const Users = lazy(() => import("./pages/console/users"));
const CacheScan = lazy(() => import("./pages/console/cache-scan"));

export const routes: RouteObject[] = [
  {
    path: "/",
    element: <LandingLayout />,
    children: [
      {
        index: true,
        element: <LandingPage />,
      },
      {
        path: "docs",
        element: <DocsPage />,
      },
      {
        path: "docs/:slug",
        element: <DocsPage />,
      },
      {
        path: "repositories",
        children: [
          { index: true, element: <Repositories /> },
          {
            path: "detail",
            element: (
              <RepositoryDetail backPath="/repositories" showActions={false} />
            ),
          },
        ],
      },
      {
        path: "tasks-public",
        element: <TasksPublic />,
      },
    ],
  },
  {
    path: "/login",
    element: <AuthPage />,
  },
  {
    path: "/register",
    element: <AuthPage />,
  },
  {
    path: "/forgot-password",
    element: <AuthPage />,
  },
  {
    path: "/console",
    element: (
      <ProtectedRoute>
        <ConsoleLayout />
      </ProtectedRoute>
    ),
    children: [
      {
        index: true,
        element: (
          <LazyLoad>
            <Dashboard />
          </LazyLoad>
        ),
      },
      {
        path: "repositories",
        children: [
          {
            index: true,
            element: (
              <LazyLoad>
                <RepositoriesConsole />
              </LazyLoad>
            ),
          },
          {
            path: "detail",
            element: (
              <LazyLoad>
                <RepositoryDetail />
              </LazyLoad>
            ),
          },
        ],
      },
      {
        path: "tasks",
        element: (
          <LazyLoad>
            <Tasks />
          </LazyLoad>
        ),
      },
      {
        path: "cache-scan",
        element: (
          <LazyLoad>
            <CacheScan />
          </LazyLoad>
        ),
      },
      {
        path: "settings",
        element: (
          <LazyLoad>
            <Settings />
          </LazyLoad>
        ),
      },
      {
        path: "users",
        element: (
          <ProtectedRoute requiredRole="admin">
            <LazyLoad>
              <Users />
            </LazyLoad>
          </ProtectedRoute>
        ),
      },
    ],
  },
];
