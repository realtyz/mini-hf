import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    if (import.meta.env.DEV) {
      console.error('[ErrorBoundary] Uncaught error:', error, errorInfo)
    }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div className="flex min-h-screen items-center justify-center bg-background p-8">
          <div className="w-full max-w-md text-center">
            <div className="mx-auto mb-6 flex size-16 items-center justify-center rounded-2xl bg-destructive/10">
              <AlertTriangle className="size-8 text-destructive" />
            </div>
            <h1 className="text-xl font-semibold tracking-tight">
              页面发生错误
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              应用遇到了意外错误，请尝试刷新页面。
            </p>
            {import.meta.env.DEV && this.state.error && (
              <div className="mt-4 rounded-lg border bg-muted/50 p-4 text-left">
                <p className="mb-1 text-xs font-medium text-muted-foreground">
                  {this.state.error.name}
                </p>
                <pre className="max-h-48 overflow-auto text-xs text-destructive whitespace-pre-wrap">
                  {this.state.error.message}
                  {this.state.error.stack && (
                    <>{'\n\n'}{this.state.error.stack}</>
                  )}
                </pre>
              </div>
            )}
            <Button
              onClick={this.handleReset}
              className="mt-6 gap-2"
              variant="outline"
            >
              <RefreshCw className="size-4" />
              重试
            </Button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
