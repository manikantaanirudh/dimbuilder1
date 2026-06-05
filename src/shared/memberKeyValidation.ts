import type { OneStreamValidationProfileConfig } from "./appConfigTypes";
import { printableRestrictedCharacter } from "./memberNamingGuidelines";

/** Member keys must contain at least one ASCII letter or digit. */
const HAS_ALPHANUMERIC = /[A-Za-z0-9]/;

export function memberKeyHasAlphanumeric(memberKey: string): boolean {
  return HAS_ALPHANUMERIC.test(memberKey.trim());
}

export function findRestrictedCharacter(
  memberKey: string,
  restrictedCharacters: string[]
): string | undefined {
  return restrictedCharacters.find((character) => memberKey.includes(character));
}

export function isReservedMemberName(memberKey: string, reservedWords: string[]): boolean {
  const normalized = memberKey.trim().toLowerCase();
  return reservedWords.some((word) => word.toLowerCase() === normalized);
}

/**
 * Validates a member key for create/update/import.
 * Returns a user-facing error message, or null when valid.
 */
export function validateMemberKey(
  memberKey: string,
  profile?: Pick<
    OneStreamValidationProfileConfig,
    "memberNameMaxLength" | "reservedWords" | "restrictedCharacters"
  >
): string | null {
  const trimmed = memberKey.trim();
  if (!trimmed) {
    return "Member key is required.";
  }

  if (!memberKeyHasAlphanumeric(trimmed)) {
    return "Member key must include at least one letter or number (cannot be only special characters).";
  }

  if (profile) {
    if (trimmed.length > profile.memberNameMaxLength) {
      return `Member key cannot exceed ${profile.memberNameMaxLength} characters.`;
    }

    const restricted = findRestrictedCharacter(trimmed, profile.restrictedCharacters);
    if (restricted) {
      return `Member key cannot contain '${printableRestrictedCharacter(restricted)}' (restricted in OneStream).`;
    }

    if (isReservedMemberName(trimmed, profile.reservedWords)) {
      return `'${trimmed}' is a reserved OneStream member name.`;
    }
  }

  return null;
}
