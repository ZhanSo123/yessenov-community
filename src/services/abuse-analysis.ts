type AbuseSignal = {
  reason: string;
  metadata: Record<string, unknown>;
};

export const analyzePostContent = (content: string): AbuseSignal | null => {
  const trimmed = content.trim();
  if (!trimmed) {
    return null;
  }

  const normalized = trimmed.toLowerCase();
  const compact = normalized.replace(/\s+/g, "");
  const uniqueChars = new Set(compact).size;
  const uniqueRatio = compact.length > 0 ? uniqueChars / compact.length : 1;

  const urlMatches = normalized.match(/https?:\/\/\S+/g) ?? [];
  const hasRepeatedChars = /(.)\1{9,}/.test(normalized);

  const words = normalized.split(/\s+/).filter(Boolean);
  const wordCounts = new Map<string, number>();
  for (const word of words) {
    wordCounts.set(word, (wordCounts.get(word) ?? 0) + 1);
  }
  const maxRepeat = Math.max(0, ...Array.from(wordCounts.values()));

  if (urlMatches.length >= 5) {
    return { reason: "Excessive links", metadata: { urlCount: urlMatches.length } };
  }
  if (hasRepeatedChars) {
    return { reason: "Repeated characters", metadata: {} };
  }
  if (words.length >= 12 && maxRepeat >= 8) {
    return { reason: "Repeated words", metadata: { maxRepeat } };
  }
  if (compact.length >= 200 && uniqueRatio < 0.12) {
    return { reason: "Low entropy content", metadata: { uniqueRatio } };
  }

  return null;
};
