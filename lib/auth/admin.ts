import { NextRequest, NextResponse } from "next/server";
import { ADMIN_TOKEN_HEADER } from "@/lib/auth/constants";
export { ADMIN_TOKEN_HEADER };

export function isAdminAuthConfigured() {
  return Boolean(process.env.ADMIN_TOKEN?.trim());
}

export function isValidAdminToken(token: string | null | undefined) {
  const expectedToken = process.env.ADMIN_TOKEN?.trim();

  if (!expectedToken) {
    return true;
  }

  return token === expectedToken;
}

export function requireAdmin(request: NextRequest) {
  const headerToken = request.headers.get(ADMIN_TOKEN_HEADER);
  const bearerToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

  if (isValidAdminToken(headerToken ?? bearerToken)) {
    return null;
  }

  return NextResponse.json(
    {
      error: "Admin token required."
    },
    { status: 401 }
  );
}
