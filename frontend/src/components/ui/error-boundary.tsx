import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "./button";

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  fallbackMessage?: string;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  public reset = () => {
    this.props.onReset?.();
    this.setState({ hasError: false, error: null });
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-2xl border border-danger-line bg-danger-bg/40 p-6 text-center shadow-soft animate-fade-in my-4">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-danger-bg text-danger-fg mb-3">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <h3 className="text-sm font-semibold text-danger-fg">
            {this.props.fallbackTitle || "Ocorreu um erro ao exibir este conteúdo"}
          </h3>
          <p className="mt-1 text-xs text-ink-soft max-w-md mx-auto">
            {this.props.fallbackMessage ||
              this.state.error?.message ||
              "Houve uma falha inesperada na renderização. Tente recarregar o componente."}
          </p>
          <div className="mt-4 flex justify-center">
            <Button variant="surface" size="sm" onClick={this.reset}>
              <RefreshCw className="h-3.5 w-3.5 mr-1" />
              Recarregar visualização
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
