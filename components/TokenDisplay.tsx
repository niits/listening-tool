"use client";

import type { ScoredToken, TokenClass } from "../lib/types";

interface TokenDisplayProps {
  tokens: ScoredToken[];
}

function tokenClass(type: TokenClass): string {
  switch (type) {
    case "correct":   return "text-green-600 dark:text-green-400";
    case "incorrect": return "text-red-500 line-through";
    case "missing":   return "text-gray-400 dark:text-gray-500 underline";
    case "extra":     return "text-amber-500 italic";
  }
}

export default function TokenDisplay({ tokens }: TokenDisplayProps) {
  return (
    <div className="flex flex-wrap gap-x-2 gap-y-1.5 font-mono text-base leading-relaxed">
      {tokens.map((token, i) => (
        <span key={i} className={tokenClass(token.class)}>
          {token.text}
        </span>
      ))}
    </div>
  );
}
