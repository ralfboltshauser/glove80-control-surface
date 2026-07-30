import { Component, type ErrorInfo, type ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error?: Error;
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = {};

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("The editor failed to render", error, errorInfo);
  }

  render() {
    if (this.state.error) {
      return (
        <main className="fatal-error">
          <div>
            <p className="eyebrow">Editor unavailable</p>
            <h1>The interface could not be rendered.</h1>
            <p>{this.state.error.message}</p>
            <button
              className="button button--primary"
              type="button"
              onClick={() => window.location.reload()}
            >
              Reload the app
            </button>
          </div>
        </main>
      );
    }
    return this.props.children;
  }
}
