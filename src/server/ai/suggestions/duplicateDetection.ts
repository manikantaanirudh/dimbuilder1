import type { DimensionMemberRecord } from "../../../shared/types";
import type { DuplicateGroup, AIDuplicateDetectionConfig } from "../../../shared/aiTypes";

export interface DuplicateDetectionInput {
  members: DimensionMemberRecord[];
  config: AIDuplicateDetectionConfig;
}

export function detectDuplicates(input: DuplicateDetectionInput): DuplicateGroup[] {
  const { members, config } = input;
  const threshold = config.similarityThreshold ?? 0.80;
  const groups: DuplicateGroup[] = [];
  const processed = new Set<string>();

  const activeMembers = members.filter((m) => m && m.memberKey && m.isActive !== false);

  for (let i = 0; i < activeMembers.length; i++) {
    const keyI = activeMembers[i].memberKey.trim();
    if (!keyI || processed.has(keyI.toLowerCase())) continue;

    const group: string[] = [keyI];
    let bestSimilarity = 0;
    let bestMethod = "levenshtein";

    for (let j = i + 1; j < activeMembers.length; j++) {
      const keyJ = activeMembers[j].memberKey.trim();
      if (!keyJ || processed.has(keyJ.toLowerCase())) continue;

      let maxSim = 0;
      let method = "levenshtein";

      if (config.methods.includes("levenshtein")) {
        const sim = levenshteinSimilarity(keyI, keyJ);
        if (sim > maxSim) {
          maxSim = sim;
          method = "levenshtein";
        }
      }

      if (config.methods.includes("soundex")) {
        const sim = soundexSimilarity(keyI, keyJ);
        if (sim > maxSim) {
          maxSim = sim;
          method = "soundex";
        }
      }

      if (config.methods.includes("prefix")) {
        const sim = prefixSimilarity(keyI, keyJ);
        if (sim > maxSim) {
          maxSim = sim;
          method = "prefix";
        }
      }

      if (maxSim >= threshold) {
        group.push(keyJ);
        processed.add(keyJ.toLowerCase());
        if (maxSim > bestSimilarity) {
          bestSimilarity = maxSim;
          bestMethod = method;
        }
      }
    }

    if (group.length > 1) {
      processed.add(keyI.toLowerCase());
      groups.push({
        members: group,
        similarity: Number(bestSimilarity.toFixed(2)),
        method: bestMethod,
      });
    }
  }

  return groups;
}

export function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    Array(n + 1).fill(0),
  );
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }
  return dp[m][n];
}

export function levenshteinSimilarity(a: string, b: string): number {
  const normA = a.replace(/[_\-\s]/g, "").toLowerCase();
  const normB = b.replace(/[_\-\s]/g, "").toLowerCase();
  if (normA === normB) return 1.0;
  const maxLen = Math.max(normA.length, normB.length);
  if (maxLen === 0) return 1.0;
  return 1 - levenshteinDistance(normA, normB) / maxLen;
}

export function soundex(str: string): string {
  const s = str.toUpperCase().replace(/[^A-Z]/g, "");
  if (s.length === 0) return "0000";

  const codes: Record<string, string> = {
    B: "1",
    F: "1",
    P: "1",
    V: "1",
    C: "2",
    G: "2",
    J: "2",
    K: "2",
    Q: "2",
    S: "2",
    X: "2",
    Z: "2",
    D: "3",
    T: "3",
    L: "4",
    M: "5",
    N: "5",
    R: "6",
  };

  let result = s[0];
  let lastCode = codes[s[0]] || "";

  for (let i = 1; i < s.length && result.length < 4; i++) {
    const code = codes[s[i]] || "";
    if (code && code !== lastCode) {
      result += code;
    }
    lastCode = code || lastCode;
  }

  return result.padEnd(4, "0");
}

export function soundexSimilarity(a: string, b: string): number {
  const wordsA = a.replace(/[_\-]/g, " ").split(/\s+/).filter(Boolean);
  const wordsB = b.replace(/[_\-]/g, " ").split(/\s+/).filter(Boolean);
  if (wordsA.length === 0 || wordsB.length === 0) return 0;

  const soundexA = wordsA.map(soundex);
  const soundexB = wordsB.map(soundex);

  let matches = 0;
  const maxWords = Math.max(soundexA.length, soundexB.length);
  for (const sa of soundexA) {
    if (soundexB.includes(sa)) matches++;
  }
  return matches / maxWords;
}

export function prefixSimilarity(a: string, b: string): number {
  const normA = a.replace(/[_\-\s]/g, "").toLowerCase();
  const normB = b.replace(/[_\-\s]/g, "").toLowerCase();
  const shorter = normA.length <= normB.length ? normA : normB;
  const longer = normA.length <= normB.length ? normB : normA;
  if (shorter.length === 0) return 0;

  let prefixLen = 0;
  for (let i = 0; i < shorter.length && i < longer.length; i++) {
    if (shorter[i] === longer[i]) prefixLen++;
    else break;
  }

  if (prefixLen >= shorter.length * 0.8) {
    return Math.min(1.0, prefixLen / longer.length + 0.2);
  }
  return prefixLen / longer.length;
}
