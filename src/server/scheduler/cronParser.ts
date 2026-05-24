/**
 * Pure-TypeScript cron expression parser and scheduler.
 * Supports standard 5-field cron: minute hour dom month dow
 * Also supports common shortcuts: @hourly, @daily, @weekly, @monthly
 */

export interface CronFields {
  minutes: number[];
  hours: number[];
  daysOfMonth: number[];
  months: number[];
  daysOfWeek: number[];
}

export function parseCronExpression(expr: string): CronFields | null {
  const shortcuts: Record<string, string> = {
    '@hourly': '0 * * * *',
    '@daily': '0 0 * * *',
    '@weekly': '0 0 * * 0',
    '@monthly': '0 0 1 * *',
    '@yearly': '0 0 1 1 *',
    '@annually': '0 0 1 1 *',
  };

  const normalized = shortcuts[expr.trim().toLowerCase()] ?? expr.trim();
  const parts = normalized.split(/\s+/);
  if (parts.length !== 5) return null;

  const minutes = parseField(parts[0], 0, 59);
  const hours = parseField(parts[1], 0, 23);
  const daysOfMonth = parseField(parts[2], 1, 31);
  const months = parseField(parts[3], 1, 12);
  const daysOfWeek = parseField(parts[4], 0, 6);

  if (!minutes || !hours || !daysOfMonth || !months || !daysOfWeek) return null;
  return { minutes, hours, daysOfMonth, months, daysOfWeek };
}

function parseField(field: string, min: number, max: number): number[] | null {
  const values = new Set<number>();

  for (const part of field.split(',')) {
    const stepMatch = part.match(/^(.+)\/(\d+)$/);
    let range: string;
    let step = 1;

    if (stepMatch) {
      range = stepMatch[1];
      step = parseInt(stepMatch[2], 10);
      if (step <= 0) return null;
    } else {
      range = part;
    }

    if (range === '*') {
      for (let i = min; i <= max; i += step) values.add(i);
    } else if (range.includes('-')) {
      const [startStr, endStr] = range.split('-');
      const start = parseInt(startStr, 10);
      const end = parseInt(endStr, 10);
      if (isNaN(start) || isNaN(end) || start < min || end > max || start > end) return null;
      for (let i = start; i <= end; i += step) values.add(i);
    } else {
      const val = parseInt(range, 10);
      if (isNaN(val) || val < min || val > max) return null;
      values.add(val);
    }
  }

  return values.size > 0 ? Array.from(values).sort((a, b) => a - b) : null;
}

export function shouldRunAt(fields: CronFields, date: Date): boolean {
  const minute = date.getMinutes();
  const hour = date.getHours();
  const dom = date.getDate();
  const month = date.getMonth() + 1; // JS months are 0-based
  const dow = date.getDay();

  return (
    fields.minutes.includes(minute) &&
    fields.hours.includes(hour) &&
    fields.daysOfMonth.includes(dom) &&
    fields.months.includes(month) &&
    fields.daysOfWeek.includes(dow)
  );
}

export function getNextRunTime(fields: CronFields, after: Date = new Date()): Date {
  const candidate = new Date(after.getTime());
  candidate.setSeconds(0, 0);
  candidate.setMinutes(candidate.getMinutes() + 1); // start from next minute

  // Iterate up to 366 days looking for next match
  const maxIterations = 366 * 24 * 60;
  for (let i = 0; i < maxIterations; i++) {
    if (shouldRunAt(fields, candidate)) return candidate;
    candidate.setMinutes(candidate.getMinutes() + 1);
  }

  // Fallback: return 1 day from now
  return new Date(after.getTime() + 86400000);
}
