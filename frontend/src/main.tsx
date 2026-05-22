import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router'
import { QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from './components/theme/ThemeProvider'
import { Toaster } from './components/ui/sonner'
import { ErrorBoundary } from './components/shared/ErrorBoundary'
import './index.css'
import { routes } from './router'
import { queryClient } from './lib/query/client'

const router = createBrowserRouter(routes)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <ThemeProvider defaultTheme="system" storageKey="mini-hf-theme">
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} unstable_useTransitions />
          <Toaster />
        </QueryClientProvider>
      </ThemeProvider>
    </ErrorBoundary>
  </StrictMode>,
)
