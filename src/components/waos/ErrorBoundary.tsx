'use client'

import { Component, ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error?: Error
}

/**
 * 全局 Error Boundary — 防止组件崩溃导致白屏
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-full items-center justify-center p-4">
          <div className="text-center max-w-sm">
            <div className="text-4xl mb-3">😵</div>
            <h2 className="text-[14px] font-semibold mb-1">组件出错了</h2>
            <p className="text-[11px] text-muted-foreground mb-3">
              {this.state.error?.message || '未知错误'}
            </p>
            <button
              onClick={() => this.setState({ hasError: false, error: undefined })}
              className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-[12px] font-medium hover:bg-primary/90 apple-btn"
            >
              重试
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
