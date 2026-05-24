export function Skeleton({ variant = "text", width, height, lines = 3, rows = 5, cols = 4, count = 3, size }: {
  variant?: "text" | "circle" | "bar" | "table" | "card";
  width?: string;
  height?: string;
  lines?: number;
  rows?: number;
  cols?: number;
  count?: number;
  size?: number;
}) {
  if (variant === "circle") {
    const s = size ?? 120;
    return <div className="skeleton skeleton-circle" style={{ width: s, height: s }} />;
  }

  if (variant === "bar") {
    return <div className="skeleton" style={{ width: width ?? "80%", height: height ?? "8px" }} />;
  }

  if (variant === "text") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "8px", width: width ?? "100%" }}>
        {Array.from({ length: lines }).map((_, i) => (
          <div key={i} className="skeleton skeleton-text" style={{ width: i === lines - 1 ? "60%" : "100%" }} />
        ))}
      </div>
    );
  }

  if (variant === "table") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "4px", width: "100%" }}>
        <div className="skeleton" style={{ height: "32px", width: "100%" }} />
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} style={{ display: "flex", gap: "8px" }}>
            {Array.from({ length: cols }).map((_, j) => (
              <div key={j} className="skeleton" style={{ height: "28px", flex: 1 }} />
            ))}
          </div>
        ))}
      </div>
    );
  }

  if (variant === "card") {
    return (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: "1rem" }}>
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="skeleton" style={{ height: "120px", borderRadius: "var(--radius-sm)" }} />
        ))}
      </div>
    );
  }

  return null;
}

export function SkeletonReportDashboard() {
  return (
    <section style={{ padding: "1.5rem 2rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1.5rem" }}>
        <Skeleton variant="text" lines={2} width="200px" />
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <Skeleton variant="bar" width="60px" height="32px" />
          <Skeleton variant="bar" width="60px" height="32px" />
          <Skeleton variant="bar" width="60px" height="32px" />
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "2rem", padding: "1.5rem", border: "1px solid var(--border)", borderRadius: "var(--radius)", marginBottom: "2rem" }}>
        <Skeleton variant="circle" size={120} />
        <Skeleton variant="text" lines={2} width="300px" />
      </div>
      <Skeleton variant="table" rows={3} cols={6} />
    </section>
  );
}

export function SkeletonAuditLog() {
  return (
    <section style={{ padding: "1.5rem 2rem" }}>
      <Skeleton variant="text" lines={1} width="200px" />
      <div style={{ marginTop: "1rem" }}><Skeleton variant="bar" width="100%" height="36px" /></div>
      <div style={{ marginTop: "1rem" }}><Skeleton variant="table" rows={8} cols={5} /></div>
    </section>
  );
}

export function SkeletonAIInsights() {
  return (
    <section style={{ padding: "1.5rem 2rem" }}>
      <Skeleton variant="text" lines={1} width="250px" />
      <div style={{ display: "flex", gap: "1rem", marginTop: "1rem", marginBottom: "1rem" }}>
        <Skeleton variant="bar" width="80px" height="32px" />
        <Skeleton variant="bar" width="80px" height="32px" />
        <Skeleton variant="bar" width="80px" height="32px" />
      </div>
      <Skeleton variant="card" count={3} />
    </section>
  );
}

export function SkeletonQualityScores() {
  return (
    <section style={{ padding: "1.5rem 2rem" }}>
      <Skeleton variant="text" lines={1} width="200px" />
      <div style={{ display: "flex", alignItems: "flex-start", gap: "2rem", marginTop: "1.5rem" }}>
        <Skeleton variant="circle" size={140} />
        <Skeleton variant="text" lines={4} width="300px" />
      </div>
      <div style={{ marginTop: "2rem" }}><Skeleton variant="card" count={4} /></div>
    </section>
  );
}
