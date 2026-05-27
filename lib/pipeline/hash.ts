import crypto from "node:crypto";
import { stripHtml } from "@/lib/utils";

export function contentHash(input: string) {
  return crypto.createHash("sha256").update(stripHtml(input).toLowerCase()).digest("hex");
}

