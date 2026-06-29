/** Leading phrases stripped before intent matching (applied repeatedly). */
const LEADING_FILLER_PATTERNS = [
  /^can you please\s+/i,
  /^can you\s+/i,
  /^could you please\s+/i,
  /^could you\s+/i,
  /^would you\s+/i,
  /^please\s+/i,
  /^help me\s+(?:to\s+)?(?:find|list|show|get|see)\s+/i,
  /^i (?:want|need|would like) to (?:know|see|get|list|find)\s+/i,
  /^tell me (?:about\s+)?/i,
  /^show me\s+/i,
  /^give me\s+/i,
  /^let me see\s+/i,
  /^what are all the\s+/i,
  /^what are the\s+/i,
  /^what are\s+/i,
  /^which are all the\s+/i,
  /^which are the\s+/i,
  /^which are\s+/i,
  /^what is all the\s+/i,
  /^what is the\s+/i,
  /^what is\s+/i,
  /^do we have (?:any\s+)?/i,
  /^are there (?:any\s+)?/i,
  /^is there (?:any\s+)?/i,
  /^list (?:out\s+)?/i,
  /^show (?:me\s+)?/i,
  /^get (?:me\s+)?/i,
  /^display\s+/i,
  /^enumerate\s+/i
];

const TRAILING_FILLER_PATTERNS = [
  /\s+please$/i,
  /\s+available$/i,
  /\s+that exist$/i,
  /\s+that are available$/i,
  /\s+in (?:the\s+)?project$/i,
  /\s+in this project$/i,
  /\s+for (?:this|the) project$/i
];

const DIMENSION_SUFFIX_PATTERNS = [
  /\s+dimension$/i,
  /\s+dimensions$/i,
  /\s+dimension members$/i
];

const NOISE_WORDS = new Set([
  "a", "an", "the", "all", "every", "each", "any", "some", "my", "this", "that",
  "in", "on", "at", "for", "from", "of", "to", "and", "or", "with", "about",
  "available", "existing", "current", "entire", "complete", "full", "total",
  "please", "me", "you", "can", "could", "would", "tell", "show", "give", "get",
  "what", "which", "how", "many", "much", "are", "is", "do", "does", "have", "has"
]);

export interface NormalizedQuery {
  raw: string;
  normalized: string;
  compact: string;
  tokens: string[];
}

export function normalizeQuery(question: string): NormalizedQuery {
  const raw = question.trim();
  let normalized = raw.toLowerCase().replace(/[?!.,;:'"]/g, " ").replace(/\s+/g, " ").trim();

  let changed = true;
  while (changed) {
    changed = false;
    for (const pattern of LEADING_FILLER_PATTERNS) {
      if (pattern.test(normalized)) {
        normalized = normalized.replace(pattern, "").trim();
        changed = true;
        break;
      }
    }
  }

  for (const pattern of TRAILING_FILLER_PATTERNS) {
    normalized = normalized.replace(pattern, "").trim();
  }
  for (const pattern of DIMENSION_SUFFIX_PATTERNS) {
    normalized = normalized.replace(pattern, "").trim();
  }

  const tokens = normalized.split(/\s+/).filter((token) => token.length > 0);
  const compact = tokens.filter((token) => !NOISE_WORDS.has(token)).join(" ");

  return { raw, normalized, compact, tokens };
}

export function containsAny(text: string, phrases: string[]): boolean {
  const haystack = text.toLowerCase();
  return phrases.some((phrase) => haystack.includes(phrase.toLowerCase()));
}

export function matchesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}
