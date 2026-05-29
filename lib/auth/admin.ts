import { NextRequest, NextResponse } from "next/server";
import { ADMIN_TOKEN_HEADER } from "@/lib/auth/constants";
export { ADMIN_TOKEN_HEADER };

export function isAdminAuthConfigured() {
  return Boolean(process.env.ADMIN_TOKEN?.trim());
}

export function isValidAdminToken(token: string | null | undefined) {
  const expectedToken = process.env.ADMIN_TOKEN?.trim();

  // CRITICAL: when ADMIN_TOKEN is not set, only allow passthrough in local
  // development (NODE_ENV === "development"). Any other environment — production,
  // staging, preview, CI, test — must deny all requests to avoid accidentally
  // leaving every admin endpoint open on a deployed server.
  if (!expectedToken) {
    if (process.env.NODE_ENV === "development") {
      return true;
    }
    return false;
  }

  return token === expectedToken;
}

export function requireAdmin(request: NextRequest) {
  // Accept token from x-admin-token header only.
  // Authorization: Bearer is intentionally removed to reduce attack surface
  // and simplify log auditing (custom headers are more visible than auth headers).
  const token = request.headers.get(ADMIN_TOKEN_HEADER);

  if (isValidAdminToken(token)) {
    return null;
  }

  return NextResponse.json(
    { error: "Admin token required." },
    { status: 401 }
  );
}
