import { ADMIN_TOKEN_HEADER, ADMIN_TOKEN_COOKIE } from "@/lib/auth/constants";

export const ADMIN_TOKEN_STORAGE_KEY = "cid-admin-token";
export { ADMIN_TOKEN_COOKIE };

const ADMIN_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

// Persist the admin token in both localStorage (read back for the x-admin-token
// header on mutations) and a cookie (so server components / route handlers can
// authorize the request server-side — localStorage is invisible to the server).
// Not HttpOnly: the client must read it back for the header, and the token is
// already JS-readable in localStorage, so this adds no XSS surface for this MVP.
export function setAdminToken(token: string): void {
  if (typeof window === "undefined") {
    return;
  }
  const trimmed = token.trim();
  if (!trimmed) {
    clearAdminToken();
    return;
  }
  window.localStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, trimmed);
  document.cookie = `${ADMIN_TOKEN_COOKIE}=${encodeURIComponent(trimmed)}; path=/; max-age=${ADMIN_COOKIE_MAX_AGE}; SameSite=Lax`;
}

export function clearAdminToken(): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY);
  document.cookie = `${ADMIN_TOKEN_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
}

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
