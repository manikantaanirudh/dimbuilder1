import type { DimensionMemberRecord } from "../../../shared/types";
import type { NamingAnomaly } from "../../../shared/aiTypes";

export interface NamingAnomalyInput {
  members: DimensionMemberRecord[];
  dimensionType: string;
}

export function detectNamingAnomalies(input: NamingAnomalyInput): NamingAnomaly[] {
  const { members } = input;
  if (members.length < 5) return [];

  const anomalies: NamingAnomaly[] = [];
  const memberKeys = members.map(m => m.memberKey);

  anomalies.push(...detectCaseAnomalies(memberKeys));
  anomalies.push(...detectSeparatorAnomalies(memberKeys));
  anomalies.push(...detectPrefixAnomalies(memberKeys));
  anomalies.push(...detectLengthAnomalies(memberKeys));

  return anomalies;
}

function detectCaseAnomalies(keys: string[]): NamingAnomaly[] {
  let pascalCount = 0;
  let upperCount = 0;

  for (const key of keys) {
    if (/^[A-Z][a-zA-Z0-9_]*$/.test(key)) pascalCount++;
    else if (/^[A-Z][A-Z0-9_]*$/.test(key)) upperCount++;
  }

  const total = keys.length;
  const threshold = 0.7;
  const anomalies: NamingAnomaly[] = [];

  if (pascalCount / total >= threshold) {
    for (const key of keys) {
      if (!/^[A-Z]/.test(key) && key !== 'Root') {
        anomalies.push({
          memberKey: key,
          expectedPattern: 'PascalCase (starts with uppercase)',
          deviation: `Starts with lowercase "${key[0]}"`,
          confidence: pascalCount / total
        });
      }
    }
  } else if (upperCount / total >= threshold) {
    for (const key of keys) {
      if (key.toUpperCase() !== key && key.length > 2 && key !== 'Root') {
        anomalies.push({
          memberKey: key,
          expectedPattern: 'UPPER_CASE',
          deviation: 'Contains lowercase characters',
          confidence: upperCount / total
        });
      }
    }
  }

  return anomalies;
}

function detectSeparatorAnomalies(keys: string[]): NamingAnomaly[] {
  let underscoreCount = 0;
  let dashCount = 0;

  const multiWordKeys = keys.filter(k => k.length > 5 && (k.includes('_') || k.includes('-') || /[a-z][A-Z]/.test(k)));
  if (multiWordKeys.length < 3) return [];

  for (const key of keys) {
    if (key.includes('_')) underscoreCount++;
    if (key.includes('-')) dashCount++;
  }

  const anomalies: NamingAnomaly[] = [];
  const total = multiWordKeys.length;

  if (underscoreCount / total >= 0.7) {
    for (const key of keys) {
      if (key.includes('-') && !key.includes('_')) {
        anomalies.push({
          memberKey: key,
          expectedPattern: 'underscore_separator',
          deviation: 'Uses dash separator instead of underscore',
          confidence: underscoreCount / total
        });
      }
    }
  } else if (dashCount / total >= 0.7) {
    for (const key of keys) {
      if (key.includes('_') && !key.includes('-')) {
        anomalies.push({
          memberKey: key,
          expectedPattern: 'dash-separator',
          deviation: 'Uses underscore separator instead of dash',
          confidence: dashCount / total
        });
      }
    }
  }

  return anomalies;
}

function detectPrefixAnomalies(keys: string[]): NamingAnomaly[] {
  const prefixCounts = new Map<string, string[]>();

  for (const key of keys) {
    const prefix = key.slice(0, 3).toLowerCase();
    if (!prefixCounts.has(prefix)) prefixCounts.set(prefix, []);
    prefixCounts.get(prefix)!.push(key);
  }

  const anomalies: NamingAnomaly[] = [];
  const totalKeys = keys.length;

  for (const [prefix, group] of prefixCounts) {
    if (group.length / totalKeys >= 0.6 && group.length >= 5) {
      for (const [otherPrefix, otherGroup] of prefixCounts) {
        if (otherPrefix !== prefix && otherGroup.length === 1) {
          anomalies.push({
            memberKey: otherGroup[0],
            expectedPattern: `Common prefix "${prefix}..."`,
            deviation: `Unique prefix "${otherPrefix}..." not matching dominant pattern`,
            confidence: 0.6
          });
        }
      }
    }
  }

  return anomalies;
}

function detectLengthAnomalies(keys: string[]): NamingAnomaly[] {
  const lengths = keys.map(k => k.length);
  const avg = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  const stdDev = Math.sqrt(lengths.reduce((sum, l) => sum + (l - avg) ** 2, 0) / lengths.length);

  if (stdDev < 3) return [];

  const anomalies: NamingAnomaly[] = [];
  for (let i = 0; i < keys.length; i++) {
    const deviation = Math.abs(keys[i].length - avg) / stdDev;
    if (deviation > 2.5) {
      anomalies.push({
        memberKey: keys[i],
        expectedPattern: `Length ~${Math.round(avg)} chars (±${Math.round(stdDev)})`,
        deviation: `Length ${keys[i].length} is ${deviation.toFixed(1)} std devs from mean`,
        confidence: Math.min(0.8, deviation / 4)
      });
    }
  }

  return anomalies;
}
