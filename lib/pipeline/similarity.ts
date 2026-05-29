function tokenize(input: string) {
  return new Set(
    input
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((word) => word.length > 2)
  );
}

export function jaccardSimilarity(left: string, right: string) {
  const a = tokenize(left);
  const b = tokenize(right);

  if (a.size === 0 && b.size === 0) {
    // Two strings with no meaningful tokens share no content — treat as dissimilar.
    // Returning 1 here would cause false deduplication for short-token titles
    // like "M 3.1 in US" vs "M 4.2 in US" (all tokens ≤ 2 chars, sets both empty).
    return 0;
  }

  const intersection = [...a].filter((word) => b.has(word)).length;
  const union = new Set([...a, ...b]).size;

  return union === 0 ? 0 : intersection / union;
}

