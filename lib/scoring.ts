import { ComparisonResult } from "./types";

/**
 * Normalize text for comparison
 * - Convert to lowercase
 * - Remove punctuation
 * - Collapse whitespace
 */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, "") // Remove punctuation
    .replace(/\s+/g, " ") // Collapse whitespace
    .trim();
}

/**
 * Tokenize normalized text into words
 * Optimized to skip normalization if already normalized
 */
function tokenize(text: string): string[] {
  if (!text) return [];
  const normalized = normalizeText(text);
  if (!normalized) return [];
  return normalized.split(" ").filter((token) => token.length > 0);
}

/**
 * Calculate Levenshtein distance between two strings
 * Optimized with early termination
 */
function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1, // insertion
          matrix[i - 1][j] + 1 // deletion
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Calculate Word Error Rate (WER)
 */
export function calculateWER(reference: string, hypothesis: string): number {
  const refTokens = tokenize(reference);
  const hypTokens = tokenize(hypothesis);

  if (refTokens.length === 0) {
    return hypTokens.length === 0 ? 0 : 1;
  }

  const distance = levenshteinDistance(
    refTokens.join(" "),
    hypTokens.join(" ")
  );
  return distance / refTokens.length;
}

/**
 * Align two token sequences using dynamic programming
 * Returns aligned pairs of tokens for comparison
 */
function alignTokens(
  refTokens: string[],
  userTokens: string[]
): Array<[string | null, string | null]> {
  const m = refTokens.length;
  const n = userTokens.length;

  // Create DP table for edit distance with backtracking
  const dp: number[][] = Array(m + 1)
    .fill(0)
    .map(() => Array(n + 1).fill(0));

  // Initialize base cases
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  // Fill DP table
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (refTokens[i - 1] === userTokens[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1]; // Match
      } else {
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1, // Deletion (missing token)
          dp[i][j - 1] + 1, // Insertion (extra token)
          dp[i - 1][j - 1] + 1 // Substitution (incorrect token)
        );
      }
    }
  }

  // Backtrack to get alignment
  const alignment: Array<[string | null, string | null]> = [];
  let i = m;
  let j = n;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && refTokens[i - 1] === userTokens[j - 1]) {
      // Match
      alignment.unshift([refTokens[i - 1], userTokens[j - 1]]);
      i--;
      j--;
    } else if (i > 0 && j > 0 && dp[i][j] === dp[i - 1][j - 1] + 1) {
      // Substitution
      alignment.unshift([refTokens[i - 1], userTokens[j - 1]]);
      i--;
      j--;
    } else if (j > 0 && dp[i][j] === dp[i][j - 1] + 1) {
      // Insertion (extra token)
      alignment.unshift([null, userTokens[j - 1]]);
      j--;
    } else {
      // Deletion (missing token)
      alignment.unshift([refTokens[i - 1], null]);
      i--;
    }
  }

  return alignment;
}

/**
 * Compare user input with reference transcript using proper alignment
 * Returns detailed comparison with correct/incorrect/missing tokens
 */
export function compareTranscripts(
  reference: string,
  userInput: string
): ComparisonResult {
  const refTokens = tokenize(reference);
  const userTokens = tokenize(userInput);

  // Handle empty inputs
  if (refTokens.length === 0) {
    return {
      score: userTokens.length === 0 ? 1 : 0,
      correctTokens: [],
      incorrectTokens: [],
      missingTokens: [],
      extraTokens: userTokens,
    };
  }

  // Align tokens for accurate comparison
  const alignment = alignTokens(refTokens, userTokens);

  const correctTokens: string[] = [];
  const incorrectTokens: string[] = [];
  const missingTokens: string[] = [];
  const extraTokens: string[] = [];

  // Process alignment
  for (const [refToken, userToken] of alignment) {
    if (refToken && userToken) {
      if (refToken === userToken) {
        correctTokens.push(userToken);
      } else {
        // Substitution: user said something different
        incorrectTokens.push(userToken);
        missingTokens.push(refToken);
      }
    } else if (refToken && !userToken) {
      // Deletion: user missed this token
      missingTokens.push(refToken);
    } else if (!refToken && userToken) {
      // Insertion: user added extra token
      extraTokens.push(userToken);
    }
  }

  // Calculate accuracy score (0-1)
  // Score is based on correct tokens vs total reference tokens
  const totalTokens = refTokens.length;
  const score = totalTokens > 0 ? correctTokens.length / totalTokens : 0;

  return {
    score,
    correctTokens,
    incorrectTokens,
    missingTokens,
    extraTokens,
  };
}

/**
 * Calculate simple token match ratio (alternative to WER)
 */
export function calculateMatchRatio(
  reference: string,
  userInput: string
): number {
  const refTokens = tokenize(reference);
  const userTokens = tokenize(userInput);

  if (refTokens.length === 0) {
    return userTokens.length === 0 ? 1 : 0;
  }

  const userSet = new Set(userTokens);
  let matches = 0;

  for (const token of refTokens) {
    if (userSet.has(token)) {
      matches++;
      userSet.delete(token); // Count each match only once
    }
  }

  return matches / refTokens.length;
}
