import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { ActionButton, Panel } from "./ui";

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public override state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error("Uncaught UI Error:", error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  public override render() {
    if (this.state.hasError) {
      return (
        <Panel className="error-boundary-panel" style={{ padding: "2rem", margin: "1rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1rem", color: "var(--danger)" }}>
            <AlertTriangle size={24} />
            <h3 style={{ margin: 0 }}>{this.props.fallbackTitle ?? "Something went wrong in this component"}</h3>
          </div>
          <p style={{ color: "var(--muted)", marginBottom: "1rem", fontSize: "0.9rem" }}>
            {this.state.error?.message ?? "An unexpected error occurred."}
          </p>
          <ActionButton variant="primary" onClick={this.handleReset}>
            <RefreshCw size={14} style={{ marginRight: "0.5rem" }} />
            Try again
          </ActionButton>
        </Panel>
      );
    }

    return this.props.children;
  }
}
