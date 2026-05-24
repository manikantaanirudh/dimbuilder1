import type { HealthReport, VelocityReport, CoverageReport, ComplianceReport } from "../../shared/reportingTypes";

export type ExportFormat = 'json' | 'html' | 'xlsx' | 'csv';

export interface ExportResult {
  format: ExportFormat;
  content: string;
  contentType: string;
  fileName: string;
}

export function exportReportAsHtml(report: HealthReport | VelocityReport | CoverageReport | ComplianceReport, title: string): ExportResult {
  const html = generateHtmlReport(report, title);
  return { format: 'html', content: html, contentType: 'text/html', fileName: `${slugify(title)}.html` };
}

export function exportReportAsCsv(report: HealthReport | VelocityReport | CoverageReport | ComplianceReport, title: string): ExportResult {
  const csv = generateCsvReport(report);
  return { format: 'csv', content: csv, contentType: 'text/csv', fileName: `${slugify(title)}.csv` };
}

function generateHtmlReport(report: unknown, title: string): string {
  const lines: string[] = [];
  lines.push('<!DOCTYPE html><html><head>');
  lines.push(`<meta charset="utf-8"><title>${escapeHtml(title)}</title>`);
  lines.push('<style>body{font-family:Arial,sans-serif;margin:40px;color:#333}h1{color:#1a1a2e}table{border-collapse:collapse;width:100%;margin:20px 0}th,td{border:1px solid #ddd;padding:8px;text-align:left}th{background:#f4f4f4}.score-high{color:#27ae60}.score-med{color:#f39c12}.score-low{color:#e74c3c}.header{border-bottom:2px solid #1a1a2e;padding-bottom:10px;margin-bottom:20px}.footer{margin-top:40px;font-size:12px;color:#888;border-top:1px solid #eee;padding-top:10px}</style>');
  lines.push('</head><body>');
  lines.push(`<div class="header"><h1>${escapeHtml(title)}</h1><p>Generated: ${new Date().toISOString()}</p></div>`);

  if (isHealthReport(report)) {
    lines.push(`<h2>Overall Score: <span class="${scoreClass(report.overallScore)}">${report.overallScore}/100</span></h2>`);
    lines.push(`<p>Trend: <strong>${report.trend}</strong></p>`);
    lines.push('<table><tr><th>Dimension</th><th>Quality</th><th>Completeness</th><th>Naming</th><th>Members</th><th>Orphans</th><th>Errors</th></tr>');
    for (const s of report.snapshots) {
      lines.push(`<tr><td>${s.dimensionType}</td><td class="${scoreClass(s.qualityScore)}">${s.qualityScore}</td><td>${s.completenessScore}</td><td>${s.namingScore}</td><td>${s.memberCount}</td><td>${s.orphanCount}</td><td>${s.validationErrorCount}</td></tr>`);
    }
    lines.push('</table>');
  } else if (isVelocityReport(report)) {
    lines.push(`<h2>Total Changes: ${report.totalChanges}</h2>`);
    lines.push('<table><tr><th>Period</th><th>Added</th><th>Modified</th><th>Deleted</th><th>Total</th></tr>');
    for (const p of report.periods) {
      lines.push(`<tr><td>${p.periodStart}</td><td>${p.membersAdded}</td><td>${p.membersModified}</td><td>${p.membersDeleted}</td><td>${p.totalChanges}</td></tr>`);
    }
    lines.push('</table>');
  } else if (isCoverageReport(report)) {
    lines.push(`<h2>Overall Coverage: <span class="${scoreClass(report.overallCoverage)}">${report.overallCoverage}%</span></h2>`);
    lines.push('<table><tr><th>Dimension</th><th>Members</th><th>Property Coverage</th><th>Description Coverage</th><th>Last Modified</th><th>Stale</th></tr>');
    for (const d of report.dimensions) {
      lines.push(`<tr><td>${d.dimensionType}</td><td>${d.memberCount}</td><td>${d.propertyCoverage}%</td><td>${d.descriptionCoverage}%</td><td>${d.lastModified.split('T')[0]}</td><td>${d.isStale ? '⚠️ Yes' : 'No'}</td></tr>`);
    }
    lines.push('</table>');
  } else if (isComplianceReport(report)) {
    lines.push(`<h2>Validation Pass Rate: <span class="${scoreClass(report.validationPassRate)}">${report.validationPassRate}%</span></h2>`);
    lines.push(`<p>Total Members: ${report.totalMembers}</p>`);
    lines.push('<table><tr><th>Dimension</th><th>Errors</th><th>Warnings</th><th>Compliance Score</th></tr>');
    for (const d of report.dimensionResults) {
      lines.push(`<tr><td>${d.dimensionType}</td><td>${d.errorCount}</td><td>${d.warningCount}</td><td class="${scoreClass(d.complianceScore)}">${d.complianceScore}%</td></tr>`);
    }
    lines.push('</table>');
  }

  lines.push('<div class="footer"><p>SR OneStream Dim Builder — Enterprise Platform v2</p></div>');
  lines.push('</body></html>');
  return lines.join('\n');
}

function generateCsvReport(report: unknown): string {
  const rows: string[][] = [];

  if (isHealthReport(report)) {
    rows.push(['Dimension', 'Quality', 'Completeness', 'Naming', 'Members', 'Orphans', 'Errors', 'Warnings']);
    for (const s of report.snapshots) {
      rows.push([s.dimensionType, String(s.qualityScore), String(s.completenessScore), String(s.namingScore), String(s.memberCount), String(s.orphanCount), String(s.validationErrorCount), String(s.validationWarningCount)]);
    }
  } else if (isVelocityReport(report)) {
    rows.push(['Period Start', 'Period End', 'Added', 'Modified', 'Deleted', 'Total']);
    for (const p of report.periods) {
      rows.push([p.periodStart, p.periodEnd, String(p.membersAdded), String(p.membersModified), String(p.membersDeleted), String(p.totalChanges)]);
    }
  } else if (isCoverageReport(report)) {
    rows.push(['Dimension', 'Members', 'Property Coverage %', 'Description Coverage %', 'Last Modified', 'Stale']);
    for (const d of report.dimensions) {
      rows.push([d.dimensionType, String(d.memberCount), String(d.propertyCoverage), String(d.descriptionCoverage), d.lastModified, d.isStale ? 'Yes' : 'No']);
    }
  } else if (isComplianceReport(report)) {
    rows.push(['Dimension', 'Errors', 'Warnings', 'Compliance Score']);
    for (const d of (report as ComplianceReport).dimensionResults) {
      rows.push([d.dimensionType, String(d.errorCount), String(d.warningCount), String(d.complianceScore)]);
    }
  }

  return rows.map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(',')).join('\n');
}

function isHealthReport(r: unknown): r is HealthReport { return r !== null && typeof r === 'object' && 'snapshots' in r && 'trend' in r; }
function isVelocityReport(r: unknown): r is VelocityReport { return r !== null && typeof r === 'object' && 'periods' in r && 'totalChanges' in r; }
function isCoverageReport(r: unknown): r is CoverageReport { return r !== null && typeof r === 'object' && 'dimensions' in r && 'overallCoverage' in r; }
function isComplianceReport(r: unknown): r is ComplianceReport { return r !== null && typeof r === 'object' && 'validationPassRate' in r; }
function scoreClass(score: number): string { return score >= 80 ? 'score-high' : score >= 50 ? 'score-med' : 'score-low'; }
function escapeHtml(s: string): string { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function slugify(s: string): string { return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
