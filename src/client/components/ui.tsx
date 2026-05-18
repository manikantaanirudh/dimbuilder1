import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";
import type { Severity } from "../../shared/types";

type Tone = "neutral" | "primary" | "success" | "warning" | "danger" | "info";

export function Panel({
  children,
  className = ""
}: {
  children: ReactNode;
  className?: string;
}) {
  return <section className={`panel ${className}`.trim()}>{children}</section>;
}

export function StatusBadge({
  tone = "neutral",
  children,
  title
}: {
  tone?: Tone;
  children: ReactNode;
  title?: string;
}) {
  return <span className={`status-badge ${tone}`} title={title}>{children}</span>;
}

export function SeverityPill({ severity }: { severity: Severity }) {
  const label = severity === "error" ? "Error" : severity === "warning" ? "Warning" : "Info";
  const tone = severity === "error" ? "danger" : severity === "warning" ? "warning" : "info";
  return <StatusBadge tone={tone}>{label}</StatusBadge>;
}

export function MetricTile({
  label,
  value,
  tone = "neutral",
  detail
}: {
  label: string;
  value: ReactNode;
  tone?: Tone;
  detail?: ReactNode;
}) {
  return (
    <div className={`metric-tile ${tone}`}>
      <strong>{value}</strong>
      <span>{label}</span>
      {detail ? <small>{detail}</small> : null}
    </div>
  );
}

export function EmptyState({
  title,
  children,
  action
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state-block">
      <strong>{title}</strong>
      <p>{children}</p>
      {action ? <div className="empty-state-actions">{action}</div> : null}
    </div>
  );
}

export function ActionButton({
  variant = "secondary",
  className = "",
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
}) {
  return (
    <button {...props} className={`action-button ${variant} ${className}`.trim()}>
      {children}
    </button>
  );
}

export function ActionLink({
  variant = "secondary",
  className = "",
  children,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & {
  variant?: "primary" | "secondary" | "ghost";
}) {
  return (
    <a {...props} className={`action-button link ${variant} ${className}`.trim()}>
      {children}
    </a>
  );
}
