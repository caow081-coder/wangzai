'use client'

import { Component, ReactNode } from 'react'

interface Props {
  children: ReactNode
  /** 当外部依赖（如 lead.id / tab 切换）变化时，ErrorBoundary 会自动重置 */
  resetKey?: string | number
  /** 自定义错误兜底渲染 */
  fallback?: (error: Error, retry: () => void) => ReactNode
}

interface State {
  hasError: boolean
  error?: Error
  /** 每次 reset 自增，作为 React remount 触发器（子组件 key 据此变化） */
  attempt: number
}

/**
 * 全局 Error Boundary — 防止组件崩溃导致白屏
 *
 * 设计：
 *  - getDerivedStateFromError 捕获渲染期错误，记录到 state
 *  - componentDidCatch 上报到 console（未来可扩展 Sentry/自定义日志）
 *  - resetKey 变化时自动重置（避免重试后立刻又抛错的死循环）
 *  - "重试" 按钮触发 attempt +1 → 通过 React key 重挂子树，确保彻底清理
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, attempt: 0 }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, attempt: 0 }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // 上报到 console，未来可扩展为 Sentry / 自定义日志服务
    console.error('[ErrorBoundary]', error, errorInfo)
  }

  componentDidUpdate(prevProps: Props) {
    // resetKey 变化时清除错误状态（让用户继续操作而不是被卡住）
    if (prevProps.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState({ hasError: false, error: undefined, attempt: this.state.attempt + 1 })
    }
  }

  handleRetry = () => {
    // 自增 attempt → 子树 key 变化 → React 卸载旧子树重新挂载
    // 这样可以避免相同的 props 再次触发同步抛错
    this.setState(prev => ({ hasError: false, error: undefined, attempt: prev.attempt + 1 }))
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return <>{this.props.fallback(this.state.error ?? new Error('未知错误'), this.handleRetry)}</>
      }
      return (
        <div className="flex h-full items-center justify-center p-4" role="alert" aria-live="assertive">
          <div className="text-center max-w-sm">
            <div className="text-4xl mb-3">😵</div>
            <h2 className="text-[14px] font-semibold mb-1">组件出错了</h2>
            <p className="text-[11px] text-muted-foreground mb-3 break-all">
              {this.state.error?.message || '未知错误'}
            </p>
            <button
              onClick={this.handleRetry}
              className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-[12px] font-medium hover:bg-primary/90 apple-btn transition-colors"
              aria-label="重试加载组件"
            >
              重试
            </button>
          </div>
        </div>
      )
    }

    // 通过 key={attempt} 强制 React 在重试时重新挂载子树
    // 避免子组件内部缓存（如 useState/localRef）残留导致重试失败
    return <div key={this.state.attempt}>{this.props.children}</div>
  }
}
