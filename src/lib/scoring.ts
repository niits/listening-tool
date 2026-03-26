/**
 * Score a user's dictation attempt against the reference transcript.
 *
 * Algorithm (per SRS Section 10):
 *  1. Normalize both strings: lowercase → remove punctuation → collapse whitespace
 *  2. Tokenize by whitespace
 *  3. Build a full edit-distance DP table (Levenshtein)
 *  4. Backtrack through the DP table to align token pairs
 *  5. Classify each aligned pair: correct | incorrect | missing | extra
 *  6. Score = correctCount / refTokens.length  (0–1)
 */

import type { ScoreResult, ScoredToken, TokenClass } from "./types";

function normalize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, "") // remove punctuation
    .replace(/\s+/g, " ") // collapse whitespace
    .trim()
    .split(" ")
    .filter(Boolean);
}

export function scoreAnswer(
  userInput: string,
  reference: string
): ScoreResult {
  const hyp = normalize(userInput); // hypothesis (user input)
  const ref = normalize(reference); // reference (correct answer)

  if (ref.length === 0) {
    return { score: 1, tokens: [] };
  }

  if (hyp.length === 0) {
    const tokens: ScoredToken[] = ref.map((t) => ({ text: t, class: "missing" as TokenClass }));
    return { score: 0, tokens };
  }

  // Build DP table: dp[i][j] = edit distance between hyp[0..i-1] and ref[0..j-1]
  const m = hyp.length;
  const n = ref.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    new Array(n + 1).fill(0)
  );

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (hyp[i - 1] === ref[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to find alignment
  const tokens: ScoredToken[] = [];
  let i = m;
  let j = n;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && hyp[i - 1] === ref[j - 1]) {
      // Match
      tokens.push({ text: ref[j - 1], class: "correct" });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] <= dp[i - 1][j - 1] && dp[i][j - 1] <= dp[i - 1][j])) {
      // Deletion from ref perspective: a reference word is missing from user input
      tokens.push({ text: ref[j - 1], class: "missing" });
      j--;
    } else if (i > 0 && (j === 0 || dp[i - 1][j] <= dp[i - 1][j - 1] && dp[i - 1][j] <= dp[i][j - 1])) {
      // Insertion: user typed an extra word not in reference
      tokens.push({ text: hyp[i - 1], class: "extra" });
      i--;
    } else {
      // Substitution
      tokens.push({ text: ref[j - 1], class: "incorrect" });
      i--;
      j--;
    }
  }

  tokens.reverse();

  const correctCount = tokens.filter((t) => t.class === "correct").length;
  const score = correctCount / ref.length;

  return { score, tokens };
}
