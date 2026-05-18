import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ComponentPropsWithoutRef, ReactNode } from "react";
import type { Severity } from "../../shared/types";

type Tone = "neutral" | "primary" | "success" | "warning" | "danger" | "info";

const severityConfig: Record<Severity, { label: string; tone: Tone }> = {
  error: { label: "Error", tone: "danger" },
  warning: { label: "Warning", tone: "warning" },
  info: { label: "Info", tone: "info" }
};

export function Panel({
  children,
  className = "",
  ...props
}: ComponentPropsWithoutRef<"section"> & {
  children: ReactNode;
  className?: string;
}) {
  return <section {...props} className={`panel ${className}`.trim()}>{children}</section>;
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
  const { label, tone } = severityConfig[severity];
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
      {detail != null ? <small>{detail}</small> : null}
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
      <div className="empty-state-description">{children}</div>
      {action ? <div className="empty-state-actions">{action}</div> : null}
    </div>
  );
}

export function ActionButton({
  variant = "secondary",
  className = "",
  type = "button",
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
}) {
  return (
    <button {...props} type={type} className={`action-button ${variant} ${className}`.trim()}>
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

export function IconButton({
  className = "",
  type = "button",
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
}) {
  return (
    <button {...props} type={type} className={`icon-button ${className}`.trim()}>
      {children}
    </button>
  );
}

export function ToolbarGroup({
  children,
  className = ""
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`toolbar-group ${className}`.trim()}>{children}</div>;
}

export function FactStrip({
  children,
  className = ""
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`fact-strip ${className}`.trim()}>{children}</div>;
}

export function FactItem({
  label,
  value,
  tone = "neutral"
}: {
  label: string;
  value: ReactNode;
  tone?: Tone;
}) {
  return (
    <span className={`fact-item ${tone}`}>
      <span>{label}</span>
      <b>{value}</b>
    </span>
  );
}
