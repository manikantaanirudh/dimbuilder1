import type { HealthReport, VelocityReport, CoverageReport, ComplianceReport } from "../../shared/reportingTypes";

export type ExportFormat = 'json' | 'html' | 'xlsx' | 'csv';

export interface ExportResult {
  format: ExportFormat;
  content: string;
  contentType: string;
  fileName: string;
}

export interface UnifiedExecutiveReport {
  project: { id: string; name: string };
  generatedAt: string;
  summary: {
    healthScore: number;
    healthTrend: string;
    qualityScore: number;
    overallCoverage: number;
    totalDimensions: number;
    totalMembers: number;
    totalOrphans: number;
    totalErrors: number;
    totalWarnings: number;
  };
  health: HealthReport;
  quality: {
    overallScore: number;
    dimensions: Array<{
      dimensionType: string;
      dimensionName?: string;
      overallScore: number;
      memberCount?: number;
      avgMemberScore?: number;
      completeness?: number;
      naming?: number;
      structure?: number;
    }>;
  };
  coverage: CoverageReport | null;
  gates: Array<{
    id: string;
    name: string;
    threshold: number;
    passed: boolean;
  }>;
}

export function exportReportAsHtml(
  report: HealthReport | VelocityReport | CoverageReport | ComplianceReport | UnifiedExecutiveReport,
  title: string
): ExportResult {
  const html = generateHtmlReport(report, title);
  return { format: 'html', content: html, contentType: 'text/html', fileName: `${slugify(title)}.html` };
}

export function exportReportAsCsv(
  report: HealthReport | VelocityReport | CoverageReport | ComplianceReport | UnifiedExecutiveReport,
  title: string
): ExportResult {
  const csv = generateCsvReport(report);
  return { format: 'csv', content: csv, contentType: 'text/csv', fileName: `${slugify(title)}.csv` };
}

function generateHtmlReport(report: unknown, title: string): string {
  const lines: string[] = [];
  lines.push('<!DOCTYPE html><html><head>');
  lines.push(`<meta charset="utf-8"><title>${escapeHtml(title)}</title>`);
  lines.push(`
    <style>
      body { font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, sans-serif; margin: 30px; color: #0f172a; background: #f8fafc; }
      .container { max-width: 1050px; margin: 0 auto; background: #ffffff; padding: 32px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.06); border: 1px solid #cbd5e1; }
      .header { border-bottom: 2px solid #0284c7; padding-bottom: 16px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: flex-end; }
      .header h1 { margin: 0; font-size: 22px; color: #0f172a; }
      .header p { margin: 4px 0 0 0; font-size: 13px; color: #64748b; }
      .kicker { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #0284c7; margin-bottom: 4px; }
      
      .hero-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; margin-bottom: 24px; }
      .hero-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; text-align: center; }
      .hero-card .val { font-size: 30px; font-weight: 800; line-height: 1.1; margin-top: 4px; }
      .hero-card .lbl { font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.03em; }
      
      h2 { font-size: 16px; font-weight: 700; color: #1e293b; margin-top: 28px; margin-bottom: 10px; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; }
      table { border-collapse: collapse; width: 100%; margin: 12px 0 24px 0; font-size: 13px; }
      th, td { border: 1px solid #cbd5e1; padding: 9px 12px; text-align: left; }
      th { background: #f1f5f9; font-weight: 600; color: #334155; }
      tr:nth-child(even) { background: #f8fafc; }
      
      .badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 700; }
      .badge-success { background: #dcfce7; color: #15803d; }
      .badge-warning { background: #fef3c7; color: #b45309; }
      .badge-danger { background: #fee2e2; color: #b91c1c; }
      
      .score-high { color: #16a34a; font-weight: 700; }
      .score-med { color: #d97706; font-weight: 700; }
      .score-low { color: #dc2626; font-weight: 700; }
      
      .footer { margin-top: 36px; font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 14px; text-align: center; }
    </style>
  </head><body><div class="container">`);

  if (isUnifiedExecutiveReport(report)) {
    lines.push(`
      <div class="header">
        <div>
          <div class="kicker">REPORTING &amp; GOVERNANCE</div>
          <h1>${escapeHtml(title)}</h1>
        </div>
        <p>Generated: ${new Date(report.generatedAt).toLocaleString()}</p>
      </div>

      <div class="hero-grid">
        <div class="hero-card">
          <div class="lbl">Health Score</div>
          <div class="val ${scoreClass(report.summary.healthScore)}">${report.summary.healthScore}/100</div>
          <div style="font-size: 12px; opacity: 0.8; text-transform: capitalize; margin-top: 2px;">${report.summary.healthTrend}</div>
        </div>
        <div class="hero-card">
          <div class="lbl">Quality Score</div>
          <div class="val ${scoreClass(report.summary.qualityScore)}">${report.summary.qualityScore}/100</div>
        </div>
        <div class="hero-card">
          <div class="lbl">Overall Coverage</div>
          <div class="val ${scoreClass(report.summary.overallCoverage)}">${report.summary.overallCoverage}%</div>
        </div>
        <div class="hero-card">
          <div class="lbl">Total Members</div>
          <div class="val" style="color: #0f172a">${report.summary.totalMembers}</div>
          <div style="font-size: 11px; opacity: 0.7; margin-top: 2px;">Across ${report.summary.totalDimensions} dimensions</div>
        </div>
      </div>
    `);

    // Quality Gates Section
    if (report.gates && report.gates.length > 0) {
      lines.push('<h2>Quality Gates</h2>');
      lines.push('<table><tr><th>Gate Name</th><th>Threshold</th><th>Status</th></tr>');
      for (const g of report.gates) {
        lines.push(`<tr><td><strong>${escapeHtml(g.name)}</strong></td><td>≥ ${g.threshold}</td><td><span class="badge ${g.passed ? 'badge-success' : 'badge-danger'}">${g.passed ? 'PASS' : 'FAIL'}</span></td></tr>`);
      }
      lines.push('</table>');
    }

    // Health Snapshots Table
    if (report.health && report.health.snapshots.length > 0) {
      lines.push('<h2>Health &amp; Dimension Scores</h2>');
      lines.push('<table><tr><th>Dimension Name</th><th>Type</th><th>Quality</th><th>Completeness</th><th>Naming</th><th>Members</th><th>Orphans</th><th>Errors / Warnings</th></tr>');
      for (const s of report.health.snapshots) {
        const name = escapeHtml(s.dimensionName || s.dimensionType);
        const type = escapeHtml(s.dimensionType);
        lines.push(`<tr>
          <td><strong>${name}</strong></td>
          <td><code>${type}</code></td>
          <td class="${scoreClass(s.qualityScore)}">${s.qualityScore}</td>
          <td>${s.completenessScore}</td>
          <td>${s.namingScore}</td>
          <td>${s.memberCount}</td>
          <td>${s.orphanCount}</td>
          <td>
            ${s.validationErrorCount > 0 ? `<span class="badge badge-danger">${s.validationErrorCount} errors</span> ` : ''}
            ${s.validationWarningCount > 0 ? `<span class="badge badge-warning">${s.validationWarningCount} warn</span> ` : ''}
            ${s.validationErrorCount === 0 && s.validationWarningCount === 0 ? '<span class="badge badge-success">Clean</span>' : ''}
          </td>
        </tr>`);
      }
      lines.push('</table>');
    }

    // Quality Breakdown Table
    if (report.quality && report.quality.dimensions.length > 0) {
      lines.push('<h2>Per-Dimension Quality Breakdown</h2>');
      lines.push('<table><tr><th>Dimension Name</th><th>Type</th><th>Overall Score</th><th>Avg Member</th><th>Completeness</th><th>Naming</th><th>Structure</th></tr>');
      for (const qd of report.quality.dimensions) {
        const name = escapeHtml(qd.dimensionName || qd.dimensionType);
        const type = escapeHtml(qd.dimensionType);
        lines.push(`<tr>
          <td><strong>${name}</strong></td>
          <td><code>${type}</code></td>
          <td class="${scoreClass(qd.overallScore)}">${qd.overallScore}/100</td>
          <td>${qd.avgMemberScore ?? 'N/A'}</td>
          <td>${qd.completeness ?? 'N/A'}</td>
          <td>${qd.naming ?? 'N/A'}</td>
          <td>${qd.structure ?? 'N/A'}</td>
        </tr>`);
      }
      lines.push('</table>');
    }

    // Coverage Analysis Table
    if (report.coverage && report.coverage.dimensions.length > 0) {
      lines.push('<h2>Metadata Coverage Analysis</h2>');
      lines.push('<table><tr><th>Dimension Name</th><th>Type</th><th>Members</th><th>Property Coverage</th><th>Description Coverage</th><th>Status</th></tr>');
      for (const cd of report.coverage.dimensions) {
        const name = escapeHtml(cd.dimensionName || cd.dimensionType);
        const type = escapeHtml(cd.dimensionType);
        lines.push(`<tr>
          <td><strong>${name}</strong></td>
          <td><code>${type}</code></td>
          <td>${cd.memberCount}</td>
          <td class="${scoreClass(cd.propertyCoverage)}">${cd.propertyCoverage}%</td>
          <td class="${scoreClass(cd.descriptionCoverage)}">${cd.descriptionCoverage}%</td>
          <td>${cd.isStale ? '<span class="badge badge-warning">Stale</span>' : '<span class="badge badge-success">Up to date</span>'}</td>
        </tr>`);
      }
      lines.push('</table>');
    }
  } else if (isHealthReport(report)) {
    lines.push(`<div class="header"><div><div class="kicker">HEALTH REPORT</div><h1>${escapeHtml(title)}</h1></div></div>`);
    lines.push(`<h2>Overall Score: <span class="${scoreClass(report.overallScore)}">${report.overallScore}/100</span></h2>`);
    lines.push(`<p>Trend: <strong>${report.trend}</strong></p>`);
    lines.push('<table><tr><th>Dimension</th><th>Quality</th><th>Completeness</th><th>Naming</th><th>Members</th><th>Orphans</th><th>Errors</th></tr>');
    for (const s of report.snapshots) {
      lines.push(`<tr><td>${escapeHtml(s.dimensionName || s.dimensionType)}</td><td class="${scoreClass(s.qualityScore)}">${s.qualityScore}</td><td>${s.completenessScore}</td><td>${s.namingScore}</td><td>${s.memberCount}</td><td>${s.orphanCount}</td><td>${s.validationErrorCount}</td></tr>`);
    }
    lines.push('</table>');
  } else if (isVelocityReport(report)) {
    lines.push(`<div class="header"><div><div class="kicker">VELOCITY REPORT</div><h1>${escapeHtml(title)}</h1></div></div>`);
    lines.push(`<h2>Total Changes: ${report.totalChanges}</h2>`);
    lines.push('<table><tr><th>Period</th><th>Added</th><th>Modified</th><th>Deleted</th><th>Total</th></tr>');
    for (const p of report.periods) {
      lines.push(`<tr><td>${p.periodStart}</td><td>${p.membersAdded}</td><td>${p.membersModified}</td><td>${p.membersDeleted}</td><td>${p.totalChanges}</td></tr>`);
    }
    lines.push('</table>');
  } else if (isCoverageReport(report)) {
    lines.push(`<div class="header"><div><div class="kicker">COVERAGE REPORT</div><h1>${escapeHtml(title)}</h1></div></div>`);
    lines.push(`<h2>Overall Coverage: <span class="${scoreClass(report.overallCoverage)}">${report.overallCoverage}%</span></h2>`);
    lines.push('<table><tr><th>Dimension</th><th>Members</th><th>Property Coverage</th><th>Description Coverage</th><th>Last Modified</th><th>Stale</th></tr>');
    for (const d of report.dimensions) {
      lines.push(`<tr><td>${escapeHtml(d.dimensionName || d.dimensionType)}</td><td>${d.memberCount}</td><td>${d.propertyCoverage}%</td><td>${d.descriptionCoverage}%</td><td>${d.lastModified ? d.lastModified.split('T')[0] : ''}</td><td>${d.isStale ? '⚠️ Yes' : 'No'}</td></tr>`);
    }
    lines.push('</table>');
  } else if (isComplianceReport(report)) {
    lines.push(`<div class="header"><div><div class="kicker">COMPLIANCE REPORT</div><h1>${escapeHtml(title)}</h1></div></div>`);
    lines.push(`<h2>Validation Pass Rate: <span class="${scoreClass(report.validationPassRate)}">${report.validationPassRate}%</span></h2>`);
    lines.push(`<p>Total Members: ${report.totalMembers}</p>`);
    lines.push('<table><tr><th>Dimension</th><th>Errors</th><th>Warnings</th><th>Compliance Score</th></tr>');
    for (const d of report.dimensionResults) {
      lines.push(`<tr><td>${escapeHtml(d.dimensionType)}</td><td>${d.errorCount}</td><td>${d.warningCount}</td><td class="${scoreClass(d.complianceScore)}">${d.complianceScore}%</td></tr>`);
    }
    lines.push('</table>');
  }

  lines.push('<div class="footer"><p>SR OneStream Dim Builder — Enterprise Governance Platform</p></div>');
  lines.push('</div></body></html>');
  return lines.join('\n');
}

function generateCsvReport(report: unknown): string {
  const rows: string[][] = [];

  if (isUnifiedExecutiveReport(report)) {
    rows.push(['=== EXECUTIVE METADATA & GOVERNANCE REPORT ===']);
    rows.push(['Project', report.project.name]);
    rows.push(['Generated At', report.generatedAt]);
    rows.push(['Health Score', String(report.summary.healthScore), report.summary.healthTrend]);
    rows.push(['Quality Score', String(report.summary.qualityScore)]);
    rows.push(['Overall Coverage %', `${report.summary.overallCoverage}%`]);
    rows.push(['Total Dimensions', String(report.summary.totalDimensions)]);
    rows.push(['Total Members', String(report.summary.totalMembers)]);
    rows.push(['Total Errors', String(report.summary.totalErrors)]);
    rows.push(['Total Warnings', String(report.summary.totalWarnings)]);
    rows.push([]);

    if (report.gates && report.gates.length > 0) {
      rows.push(['=== QUALITY GATES ===']);
      rows.push(['Gate Name', 'Threshold', 'Status']);
      for (const g of report.gates) {
        rows.push([g.name, `>= ${g.threshold}`, g.passed ? 'PASS' : 'FAIL']);
      }
      rows.push([]);
    }

    if (report.health && report.health.snapshots.length > 0) {
      rows.push(['=== HEALTH & DIMENSION SCORES ===']);
      rows.push(['Dimension Name', 'Dimension Type', 'Quality Score', 'Completeness Score', 'Naming Score', 'Member Count', 'Orphan Count', 'Errors', 'Warnings']);
      for (const s of report.health.snapshots) {
        rows.push([
          s.dimensionName || s.dimensionType,
          s.dimensionType,
          String(s.qualityScore),
          String(s.completenessScore),
          String(s.namingScore),
          String(s.memberCount),
          String(s.orphanCount),
          String(s.validationErrorCount),
          String(s.validationWarningCount)
        ]);
      }
      rows.push([]);
    }

    if (report.quality && report.quality.dimensions.length > 0) {
      rows.push(['=== PER-DIMENSION QUALITY BREAKDOWN ===']);
      rows.push(['Dimension Name', 'Dimension Type', 'Overall Score', 'Avg Member Score', 'Completeness Score', 'Naming Score', 'Structure Score']);
      for (const qd of report.quality.dimensions) {
        rows.push([
          qd.dimensionName || qd.dimensionType,
          qd.dimensionType,
          String(qd.overallScore),
          String(qd.avgMemberScore ?? ''),
          String(qd.completeness ?? ''),
          String(qd.naming ?? ''),
          String(qd.structure ?? '')
        ]);
      }
      rows.push([]);
    }

    if (report.coverage && report.coverage.dimensions.length > 0) {
      rows.push(['=== METADATA COVERAGE ANALYSIS ===']);
      rows.push(['Dimension Name', 'Dimension Type', 'Member Count', 'Property Coverage %', 'Description Coverage %', 'Last Modified', 'Stale']);
      for (const cd of report.coverage.dimensions) {
        rows.push([
          cd.dimensionName || cd.dimensionType,
          cd.dimensionType,
          String(cd.memberCount),
          `${cd.propertyCoverage}%`,
          `${cd.descriptionCoverage}%`,
          cd.lastModified ? cd.lastModified.split('T')[0] : '',
          cd.isStale ? 'Yes' : 'No'
        ]);
      }
      rows.push([]);
    }
  } else if (isHealthReport(report)) {
    rows.push(['Dimension Name', 'Dimension Type', 'Quality', 'Completeness', 'Naming', 'Members', 'Orphans', 'Errors', 'Warnings']);
    for (const s of report.snapshots) {
      rows.push([s.dimensionName || s.dimensionType, s.dimensionType, String(s.qualityScore), String(s.completenessScore), String(s.namingScore), String(s.memberCount), String(s.orphanCount), String(s.validationErrorCount), String(s.validationWarningCount)]);
    }
  } else if (isVelocityReport(report)) {
    rows.push(['Period Start', 'Period End', 'Added', 'Modified', 'Deleted', 'Total']);
    for (const p of report.periods) {
      rows.push([p.periodStart, p.periodEnd, String(p.membersAdded), String(p.membersModified), String(p.membersDeleted), String(p.totalChanges)]);
    }
  } else if (isCoverageReport(report)) {
    rows.push(['Dimension Name', 'Dimension Type', 'Members', 'Property Coverage %', 'Description Coverage %', 'Last Modified', 'Stale']);
    for (const d of report.dimensions) {
      rows.push([d.dimensionName || d.dimensionType, d.dimensionType, String(d.memberCount), String(d.propertyCoverage), String(d.descriptionCoverage), d.lastModified, d.isStale ? 'Yes' : 'No']);
    }
  } else if (isComplianceReport(report)) {
    rows.push(['Dimension Type', 'Errors', 'Warnings', 'Compliance Score']);
    for (const d of (report as ComplianceReport).dimensionResults) {
      rows.push([d.dimensionType, String(d.errorCount), String(d.warningCount), String(d.complianceScore)]);
    }
  }

  return rows.map(row => row.map(cell => `"${(cell || '').replace(/"/g, '""')}"`).join(',')).join('\n');
}

function isUnifiedExecutiveReport(r: unknown): r is UnifiedExecutiveReport { return r !== null && typeof r === 'object' && 'summary' in r && 'health' in r; }
function isHealthReport(r: unknown): r is HealthReport { return r !== null && typeof r === 'object' && 'snapshots' in r && 'trend' in r; }
function isVelocityReport(r: unknown): r is VelocityReport { return r !== null && typeof r === 'object' && 'periods' in r && 'totalChanges' in r; }
function isCoverageReport(r: unknown): r is CoverageReport { return r !== null && typeof r === 'object' && 'dimensions' in r && 'overallCoverage' in r; }
function isComplianceReport(r: unknown): r is ComplianceReport { return r !== null && typeof r === 'object' && 'validationPassRate' in r; }
function scoreClass(score: number): string { return score >= 80 ? 'score-high' : score >= 50 ? 'score-med' : 'score-low'; }
function escapeHtml(s: string): string { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function slugify(s: string): string { return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
