/**
 * OneStream official member naming guidelines (dimension member names).
 * @see OneStream documentation — member names are unique per dimension type,
 * limited to 500 characters; spaces are allowed but not recommended; use
 * underscores instead of spaces/periods when possible; bracket syntax is
 * required in queries when the stored name contains a space or period.
 */

export const ONESTREAM_MEMBER_NAME_MAX_LENGTH = 500;

/**
 * Characters that must not appear in a stored member name.
 * Square brackets are omitted — they are query syntax, not part of the stored name.
 */
export const ONESTREAM_MEMBER_NAME_RESTRICTED_CHARACTERS = [
  "/", "|", "!", "@", "#", ",", ";", "^", "*", "+", "-", "=", "\\",
  "?", "<", ">", "\"", "{", "}", "&", "\t", "\r", "\n"
] as const;

export function memberNameRequiresQueryBrackets(memberKey: string): boolean {
  return /\s/.test(memberKey) || memberKey.includes(".");
}

export function memberNameUsesRecommendedUnderscores(memberKey: string): boolean {
  return !/\s/.test(memberKey) && !memberKey.includes(".");
}

export function formatQueryMemberReference(dimensionType: string, memberKey: string): string {
  const prefix = dimensionType.length <= 2 ? dimensionType.toUpperCase() : dimensionType[0]!.toUpperCase();
  if (memberNameRequiresQueryBrackets(memberKey)) {
    return `${prefix}#[${memberKey}]`;
  }
  return `${prefix}#${memberKey}`;
}

export function printableRestrictedCharacter(character: string): string {
  if (character === "\t") return "\\t";
  if (character === "\n") return "\\n";
  if (character === "\r") return "\\r";
  return character;
}
