export function normalizeHeader(value: unknown): string {
  return normalizeCellValue(value).replace(/\s+/g, " ").trim();
}

export function normalizeCellValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    if ("text" in value && typeof value.text === "string") return value.text.trim();
    if ("result" in value) return normalizeCellValue(value.result);
    if ("formula" in value && !("result" in value)) return "";
  }
  return String(value).trim();
}

export function isBlankValue(value: unknown): boolean {
  return normalizeCellValue(value) === "";
}

export function isFormulaError(value: unknown): boolean {
  return /^#(NAME|VALUE|REF|DIV\/0|N\/A|NULL|NUM)\??$/i.test(normalizeCellValue(value));
}

export function hasInvalidXmlControlCharacters(value: unknown): boolean {
  return /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(normalizeCellValue(value));
}

export function escapeXml(value: unknown): string {
  return normalizeCellValue(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function parseOptionalNumber(value: unknown): number | null {
  const normalized = normalizeCellValue(value);
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

