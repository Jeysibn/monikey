import { Component, type ErrorInfo, type ReactNode } from 'react'
import { CircleAlert } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { isChunkLoadError } from '@/lib/chunkErrors'

/*
 * Catches an error thrown while a part of the screen renders (or while its lazy chunk loads) so one broken view
 * cannot blank the whole app. It says what happened in one sentence, offers Try again, and leaves the navigation
 * and every other view working. If the cause is a chunk that could not be downloaded, Try again reloads the page,
 * because a failed lazy import is cached by React and would otherwise fail the same way forever.
 * It never shows technical details to the person; they go to the console for whoever is looking.
 */
interface Props {
  what: string // "the Dashboard": completes "Couldn't load ___"
  children: ReactNode
  resetKey?: unknown // changing it (for example leaving and re-entering the view) clears the error
}
interface State { error: Error | null; resetKey: unknown }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, resetKey: this.props.resetKey }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  // A new reset key (for example the person left the view and came back) clears the error without any extra render.
  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    return props.resetKey !== state.resetKey ? { error: null, resetKey: props.resetKey } : null
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`${this.props.what} failed to render`, error, info.componentStack)
  }

  private retry = () => {
    if (isChunkLoadError(this.state.error)) window.location.reload()
    else this.setState({ error: null })
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children
    return (
      <div role="alert" className="grid gap-3 rounded-card border border-border bg-card p-5 md:p-6">
        <p className="flex items-start gap-2 font-semibold">
          <CircleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-error-ink" />
          Couldn’t load {this.props.what}.
        </p>
        <p className="text-sm text-muted-foreground">
          {isChunkLoadError(this.state.error) ? 'Part of the page did not download. Check your connection and try again.' : 'Something went wrong showing this page. Your accounts and activity are not affected.'}
        </p>
        <div>
          <Button onClick={this.retry}>Try again</Button>
        </div>
      </div>
    )
  }
}
