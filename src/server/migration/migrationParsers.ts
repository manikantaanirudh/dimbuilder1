/**
 * Migration parsers for legacy EPM system exports.
 * 
 * Supported formats:
 * - Hyperion HFM (CSV flat-file dimension exports)
 * - Hyperion Planning/EPMA (metadata flat files)
 * - SAP BPC (dimension member CSV exports)
 * - Generic CSV (configurable column mapping)
 * 
 * All parsers produce a unified ParsedDimension result.
 */

export interface ParsedMember {
  memberKey: string;
  description: string;
  parent?: string;
  properties: Record<string, string>;
}

export interface ParsedDimension {
  dimensionType: string;
  dimensionName: string;
  members: ParsedMember[];
  relationships: Array<{ parentKey: string; childKey: string }>;
  warnings: string[];
}

export interface MigrationParseResult {
  dimensions: ParsedDimension[];
  totalMembers: number;
  totalRelationships: number;
  warnings: string[];
}

/**
 * Parse Hyperion HFM metadata export.
 * HFM exports are semicolon-delimited with format:
 * DimensionName;MemberName;ParentName;Alias;AccountType;...
 */
export function parseHyperionHFM(content: string): MigrationParseResult {
  const lines = content.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  if (lines.length === 0) return { dimensions: [], totalMembers: 0, totalRelationships: 0, warnings: ['Empty file'] };

  const warnings: string[] = [];
  const dimensionMap = new Map<string, ParsedDimension>();

  // Detect delimiter (HFM typically uses semicolons)
  const delimiter = lines[0].includes(';') ? ';' : ',';

  // First line may be a header
  const firstFields = lines[0].split(delimiter);
  const hasHeader = firstFields.some(f => /^(dimension|member|parent|alias)/i.test(f.trim()));
  const startLine = hasHeader ? 1 : 0;

  for (let i = startLine; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i], delimiter);
    if (fields.length < 3) {
      warnings.push(`Line ${i + 1}: insufficient fields (got ${fields.length}, need at least 3)`);
      continue;
    }

    const dimName = fields[0].trim();
    const memberKey = fields[1].trim();
    const parentKey = fields[2].trim();
    const alias = fields.length > 3 ? fields[3].trim() : '';

    if (!memberKey) continue;

    if (!dimensionMap.has(dimName)) {
      dimensionMap.set(dimName, {
        dimensionType: mapDimensionType(dimName),
        dimensionName: dimName,
        members: [],
        relationships: [],
        warnings: []
      });
    }

    const dim = dimensionMap.get(dimName)!;
    const properties: Record<string, string> = {};
    if (alias) properties['Alias'] = alias;
    // HFM has additional properties in columns 4+
    if (fields.length > 4) properties['AccountType'] = fields[4].trim();
    if (fields.length > 5) properties['IsCalculated'] = fields[5].trim();

    dim.members.push({ memberKey, description: alias || memberKey, parent: parentKey || undefined, properties });

    if (parentKey && parentKey !== memberKey) {
      dim.relationships.push({ parentKey, childKey: memberKey });
    }
  }

  const dimensions = Array.from(dimensionMap.values());
  const totalMembers = dimensions.reduce((sum, d) => sum + d.members.length, 0);
  const totalRelationships = dimensions.reduce((sum, d) => sum + d.relationships.length, 0);

  return { dimensions, totalMembers, totalRelationships, warnings };
}

/**
 * Parse Hyperion Planning/EPMA metadata flat file.
 * EPMA format: comma-delimited, first row is header, columns include
 * Member, Parent, Alias, DataStorage, UDA, etc.
 */
export function parseHyperionEPMA(content: string, dimensionName: string = 'Account'): MigrationParseResult {
  const lines = content.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  if (lines.length < 2) return { dimensions: [], totalMembers: 0, totalRelationships: 0, warnings: ['File too short'] };

  const warnings: string[] = [];
  const headerFields = parseCsvLine(lines[0], ',').map(h => h.trim().toLowerCase());

  const memberIdx = headerFields.indexOf('member');
  const parentIdx = headerFields.indexOf('parent');
  const aliasIdx = headerFields.indexOf('alias');
  const dataStorageIdx = headerFields.indexOf('datastorage');

  if (memberIdx === -1) {
    warnings.push('No "Member" column found in header');
    return { dimensions: [], totalMembers: 0, totalRelationships: 0, warnings };
  }

  const members: ParsedMember[] = [];
  const relationships: Array<{ parentKey: string; childKey: string }> = [];

  for (let i = 1; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i], ',');
    const memberKey = fields[memberIdx]?.trim();
    if (!memberKey) continue;

    const parentKey = parentIdx >= 0 ? fields[parentIdx]?.trim() : undefined;
    const alias = aliasIdx >= 0 ? fields[aliasIdx]?.trim() : '';
    const properties: Record<string, string> = {};

    if (alias) properties['Alias'] = alias;
    if (dataStorageIdx >= 0 && fields[dataStorageIdx]) properties['DataStorage'] = fields[dataStorageIdx].trim();

    // Map remaining header columns to properties
    for (let col = 0; col < headerFields.length; col++) {
      if (col === memberIdx || col === parentIdx || col === aliasIdx) continue;
      if (fields[col]?.trim()) properties[headerFields[col]] = fields[col].trim();
    }

    members.push({ memberKey, description: alias || memberKey, parent: parentKey || undefined, properties });

    if (parentKey && parentKey !== memberKey) {
      relationships.push({ parentKey, childKey: memberKey });
    }
  }

  const dim: ParsedDimension = {
    dimensionType: mapDimensionType(dimensionName),
    dimensionName,
    members,
    relationships,
    warnings: []
  };

  return { dimensions: [dim], totalMembers: members.length, totalRelationships: relationships.length, warnings };
}

/**
 * Parse SAP BPC dimension member CSV export.
 * BPC exports: ID, PARENTH1, PARENTH2, ..., EVDESCRIPTION, properties...
 */
export function parseSAPBPC(content: string, dimensionName: string = 'Account'): MigrationParseResult {
  const lines = content.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  if (lines.length < 2) return { dimensions: [], totalMembers: 0, totalRelationships: 0, warnings: ['File too short'] };

  const warnings: string[] = [];
  const headerFields = parseCsvLine(lines[0], ',').map(h => h.trim().toUpperCase());

  const idIdx = headerFields.indexOf('ID');
  if (idIdx === -1) {
    warnings.push('No "ID" column found in header');
    return { dimensions: [], totalMembers: 0, totalRelationships: 0, warnings };
  }

  // Find parent hierarchy columns (PARENTH1, PARENTH2, ...)
  const parentCols = headerFields
    .map((h, i) => ({ name: h, idx: i }))
    .filter(c => /^PARENTH\d+$/.test(c.name))
    .sort((a, b) => a.name.localeCompare(b.name));

  const descIdx = headerFields.indexOf('EVDESCRIPTION');

  const members: ParsedMember[] = [];
  const relationships: Array<{ parentKey: string; childKey: string }> = [];

  for (let i = 1; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i], ',');
    const memberKey = fields[idIdx]?.trim();
    if (!memberKey) continue;

    const description = descIdx >= 0 ? (fields[descIdx]?.trim() || memberKey) : memberKey;
    const properties: Record<string, string> = {};

    // Map non-standard columns as properties
    for (let col = 0; col < headerFields.length; col++) {
      if (col === idIdx || col === descIdx || parentCols.some(p => p.idx === col)) continue;
      if (fields[col]?.trim()) properties[headerFields[col]] = fields[col].trim();
    }

    // Primary parent is PARENTH1
    const primaryParent = parentCols.length > 0 ? fields[parentCols[0].idx]?.trim() : undefined;

    members.push({ memberKey, description, parent: primaryParent || undefined, properties });

    // Create relationships for all parent hierarchies
    for (const pc of parentCols) {
      const parentKey = fields[pc.idx]?.trim();
      if (parentKey && parentKey !== memberKey) {
        relationships.push({ parentKey, childKey: memberKey });
      }
    }
  }

  const dim: ParsedDimension = {
    dimensionType: mapDimensionType(dimensionName),
    dimensionName,
    members,
    relationships,
    warnings: []
  };

  return { dimensions: [dim], totalMembers: members.length, totalRelationships: relationships.length, warnings };
}

/**
 * Parse a generic CSV with configurable column mapping.
 */
export function parseGenericCSV(content: string, config: {
  dimensionName?: string;
  memberColumn?: string;
  parentColumn?: string;
  descriptionColumn?: string;
  delimiter?: string;
} = {}): MigrationParseResult {
  const delimiter = config.delimiter || ',';
  const lines = content.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  if (lines.length < 2) return { dimensions: [], totalMembers: 0, totalRelationships: 0, warnings: ['File too short'] };

  const warnings: string[] = [];
  const headerFields = parseCsvLine(lines[0], delimiter).map(h => h.trim().toLowerCase());

  const memberCol = (config.memberColumn || 'member').toLowerCase();
  const parentCol = (config.parentColumn || 'parent').toLowerCase();
  const descCol = (config.descriptionColumn || 'description').toLowerCase();

  const memberIdx = headerFields.indexOf(memberCol);
  const parentIdx = headerFields.indexOf(parentCol);
  const descIdx = headerFields.indexOf(descCol);

  if (memberIdx === -1) {
    // Try common alternatives
    const altMember = headerFields.findIndex(h => ['id', 'key', 'name', 'memberkey', 'member_key'].includes(h));
    if (altMember === -1) {
      warnings.push(`Column "${memberCol}" not found. Available: ${headerFields.join(', ')}`);
      return { dimensions: [], totalMembers: 0, totalRelationships: 0, warnings };
    }
  }

  const effectiveMemberIdx = memberIdx >= 0 ? memberIdx : headerFields.findIndex(h => ['id', 'key', 'name', 'memberkey', 'member_key'].includes(h));
  const effectiveParentIdx = parentIdx >= 0 ? parentIdx : headerFields.findIndex(h => ['parent', 'parent_key', 'parentkey', 'parentmember'].includes(h));

  const members: ParsedMember[] = [];
  const relationships: Array<{ parentKey: string; childKey: string }> = [];

  for (let i = 1; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i], delimiter);
    const memberKey = fields[effectiveMemberIdx]?.trim();
    if (!memberKey) continue;

    const parentKey = effectiveParentIdx >= 0 ? fields[effectiveParentIdx]?.trim() : undefined;
    const description = descIdx >= 0 ? (fields[descIdx]?.trim() || memberKey) : memberKey;

    const properties: Record<string, string> = {};
    for (let col = 0; col < headerFields.length; col++) {
      if (col === effectiveMemberIdx || col === effectiveParentIdx || col === descIdx) continue;
      if (fields[col]?.trim()) properties[headerFields[col]] = fields[col].trim();
    }

    members.push({ memberKey, description, parent: parentKey || undefined, properties });
    if (parentKey && parentKey !== memberKey) {
      relationships.push({ parentKey, childKey: memberKey });
    }
  }

  const dimName = config.dimensionName || 'Imported';
  const dim: ParsedDimension = {
    dimensionType: mapDimensionType(dimName),
    dimensionName: dimName,
    members,
    relationships,
    warnings: []
  };

  return { dimensions: [dim], totalMembers: members.length, totalRelationships: relationships.length, warnings };
}

// --- Helpers ---

function parseCsvLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

function mapDimensionType(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes('account') || lower.includes('acct')) return 'Account';
  if (lower.includes('entity') || lower.includes('org')) return 'Entity';
  if (lower.includes('scenario') || lower.includes('scen')) return 'Scenario';
  if (lower.includes('time') || lower.includes('period') || lower.includes('year')) return 'Time';
  if (lower.includes('flow') || lower.includes('movement')) return 'Flow';
  if (lower.includes('ic') || lower.includes('intercompany')) return 'IC';
  if (lower.includes('ud') || lower.includes('custom')) return 'UD1';
  return 'Account'; // default
}
