import { ADMIN_TOKEN_HEADER } from "@/lib/auth/constants";

export const ADMIN_TOKEN_STORAGE_KEY = "cid-admin-token";

export function getAdminHeaders(): HeadersInit {
  if (typeof window === "undefined") {
    return {};
  }

  const token = window.localStorage.getItem(ADMIN_TOKEN_STORAGE_KEY);
  return token ? { [ADMIN_TOKEN_HEADER]: token } : {};
}

export async function parseMutationResponse(response: Response) {
  const payload = await response.json().catch(() => null);

  if (response.ok) {
    return {
      ok: true as const,
      payload
    };
  }

  const error = typeof payload?.error === "string" ? payload.error : "Request failed.";

  return {
    ok: false as const,
    error:
      response.status === 401
        ? `${error} Save the admin token and retry.`
        : error,
    payload
  };
}
