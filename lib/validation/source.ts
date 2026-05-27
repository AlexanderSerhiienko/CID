import { SourceType } from "@prisma/client";
import { z } from "zod";

const privateHostPatterns = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^0\.0\.0\.0$/
];

function isAllowedSourceUrl(value: string) {
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) {
      return false;
    }

    return !privateHostPatterns.some((pattern) => pattern.test(url.hostname));
  } catch {
    return false;
  }
}

export const createSourceSchema = z.object({
  name: z.string().min(2),
  url: z.string().url().refine(isAllowedSourceUrl, "Source URL must be public HTTP(S)"),
  type: z.nativeEnum(SourceType).default(SourceType.RSS),
  enabled: z.boolean().default(true),
  trustScore: z.number().min(0).max(1).default(0.5)
});

export const updateSourceSchema = createSourceSchema.partial();

