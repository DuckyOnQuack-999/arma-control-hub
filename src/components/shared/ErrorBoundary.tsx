import { Component, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-background p-8">
          <div className="max-w-md text-center space-y-4">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-destructive/50 bg-destructive/10">
              <AlertTriangle className="h-8 w-8 text-destructive" />
            </div>
            <h1 className="font-display text-xl font-bold tracking-wide text-destructive">
              SYSTEM ERROR
            </h1>
            <p className="text-sm text-muted-foreground">
              Something went wrong. The grid has encountered an unexpected fault.
            </p>
            {this.state.error && (
              <pre className="rounded-md border border-border bg-muted p-3 text-xs font-mono text-muted-foreground text-left overflow-auto max-h-32">
                {this.state.error.message}
              </pre>
            )}
            <Button onClick={this.handleReset} className="font-display text-xs tracking-widest">
              <RotateCcw className="h-4 w-4 mr-2" /> RETRY
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
