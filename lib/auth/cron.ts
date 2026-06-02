import { NextRequest } from "next/server";

/**
 * Validate a cron request's Authorization header against CRON_SECRET.
 *
 * Returns the validated secret on success so callers can reuse it for the
 * continuation fetch (instead of re-reading process.env with a non-null
 * assertion). Returns null when CRON_SECRET is unset or the header does not match.
 */
export function authorizeCron(request: NextRequest): string | null {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return null;
  }
  const auth = request.headers.get("authorization");
  return auth === `Bearer ${cronSecret}` ? cronSecret : null;
}
