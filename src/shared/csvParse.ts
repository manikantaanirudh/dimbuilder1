export interface ParsedCsvDocument {
  headers: string[];
  rows: Array<Record<string, string>>;
}

/** Infer delimiter from the first non-empty line (semicolon exports are common in EPM tools). */
export function detectCsvDelimiter(content: string): string {
  const line =
    content
      .replace(/^\uFEFF/, "")
      .split(/\r?\n/)
      .map((row) => row.trim())
      .find((row) => row.length > 0) ?? "";
  const commaCount = (line.match(/,/g) ?? []).length;
  const semiCount = (line.match(/;/g) ?? []).length;
  const tabCount = (line.match(/\t/g) ?? []).length;
  if (semiCount > commaCount && semiCount >= tabCount) return ";";
  if (tabCount > commaCount && tabCount > semiCount) return "\t";
  return ",";
}

/** Parse CSV text into headers and row objects keyed by header name. */
export function parseCsvDocument(content: string, delimiter = ","): ParsedCsvDocument {
  const lines = content
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    return { headers: [], rows: [] };
  }

  const headers = parseCsvLine(lines[0], delimiter).map((header) => header.trim());
  const rows: Array<Record<string, string>> = [];

  for (let index = 1; index < lines.length; index += 1) {
    const fields = parseCsvLine(lines[index], delimiter);
    const row: Record<string, string> = {};
    for (let column = 0; column < headers.length; column += 1) {
      const header = headers[column];
      if (!header) continue;
      row[header] = (fields[column] ?? "").trim();
    }
    if (Object.values(row).some((value) => value.length > 0)) {
      rows.push(row);
    }
  }

  return { headers, rows };
}

export function parseCsvLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (!inQuotes && character === delimiter) {
      result.push(current);
      current = "";
      continue;
    }
    current += character;
  }

  result.push(current);
  return result;
}
