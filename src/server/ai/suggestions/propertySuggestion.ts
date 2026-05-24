import type { DimensionMemberRecord } from "../../../shared/types";
import type { PropertySuggestion } from "../../../shared/aiTypes";

export interface PropertySuggestionInput {
  members: DimensionMemberRecord[];
  dimensionType: string;
}

export function suggestProperties(input: PropertySuggestionInput): PropertySuggestion[] {
  const { members, dimensionType } = input;
  const suggestions: PropertySuggestion[] = [];

  if (dimensionType === 'Account') {
    suggestions.push(...suggestAccountType(members));
  }

  suggestions.push(...suggestFromSiblingPatterns(members));
  return suggestions;
}

const accountTypePatterns: Array<{ pattern: RegExp; type: string }> = [
  { pattern: /^(Rev|Revenue|Sales|Income)/i, type: 'Revenue' },
  { pattern: /^(Exp|Expense|Cost|COGS|SGA|OpEx)/i, type: 'Expense' },
  { pattern: /^(Asset|Cash|AR|Receivable|Inventory|PPE|Equipment)/i, type: 'Asset' },
  { pattern: /^(Liab|Liability|AP|Payable|Debt|Loan)/i, type: 'Liability' },
  { pattern: /^(Equity|Retained|Capital|Share)/i, type: 'Equity' },
  { pattern: /^(Stat|Statistical|FTE|Headcount|Volume)/i, type: 'Statistical' },
  { pattern: /^(IC|Intercompany|Elim)/i, type: 'Intercompany' }
];

function suggestAccountType(members: DimensionMemberRecord[]): PropertySuggestion[] {
  const suggestions: PropertySuggestion[] = [];

  for (const member of members) {
    const currentType = member.properties['AccountType'] || member.properties['Account Type'];
    if (currentType) continue;

    for (const { pattern, type } of accountTypePatterns) {
      if (pattern.test(member.memberKey)) {
        suggestions.push({
          memberKey: member.memberKey,
          propertyName: 'AccountType',
          suggestedValue: type,
          confidence: 0.8,
          reason: `Member name matches ${type} pattern`
        });
        break;
      }
    }
  }

  return suggestions;
}

function suggestFromSiblingPatterns(members: DimensionMemberRecord[]): PropertySuggestion[] {
  const suggestions: PropertySuggestion[] = [];
  const propertyPresence = new Map<string, { present: number; missing: string[] }>();

  for (const member of members) {
    for (const propName of Object.keys(member.properties)) {
      if (!propertyPresence.has(propName)) {
        propertyPresence.set(propName, { present: 0, missing: [] });
      }
    }
  }

  for (const propName of propertyPresence.keys()) {
    for (const member of members) {
      const value = member.properties[propName];
      if (value !== undefined && value !== null && value !== '') {
        propertyPresence.get(propName)!.present++;
      } else {
        propertyPresence.get(propName)!.missing.push(member.memberKey);
      }
    }
  }

  for (const [propName, { present, missing }] of propertyPresence) {
    const coverage = present / members.length;
    if (coverage >= 0.8 && missing.length > 0 && missing.length <= 5) {
      const valueCounts = new Map<string, number>();
      for (const member of members) {
        const val = String(member.properties[propName] ?? '');
        if (val) valueCounts.set(val, (valueCounts.get(val) || 0) + 1);
      }

      const mostCommon = [...valueCounts.entries()].sort((a, b) => b[1] - a[1])[0];
      if (mostCommon) {
        for (const memberKey of missing) {
          suggestions.push({
            memberKey,
            propertyName: propName,
            suggestedValue: mostCommon[0],
            confidence: 0.5,
            reason: `${Math.round(coverage * 100)}% of members have this property — most common value is "${mostCommon[0]}"`
          });
        }
      }
    }
  }

  return suggestions;
}
