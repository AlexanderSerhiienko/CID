import { afterEach, describe, expect, it } from "vitest";
import { isAdminAuthConfigured, isValidAdminToken } from "@/lib/auth/admin";

const originalAdminToken = process.env.ADMIN_TOKEN;

afterEach(() => {
  process.env.ADMIN_TOKEN = originalAdminToken;
});

describe("admin auth", () => {
  it("allows mutations when admin auth is not configured", () => {
    delete process.env.ADMIN_TOKEN;

    expect(isAdminAuthConfigured()).toBe(false);
    expect(isValidAdminToken(undefined)).toBe(true);
  });

  it("rejects missing token when admin auth is configured", () => {
    process.env.ADMIN_TOKEN = "secret";

    expect(isAdminAuthConfigured()).toBe(true);
    expect(isValidAdminToken(undefined)).toBe(false);
  });

  it("rejects wrong token", () => {
    process.env.ADMIN_TOKEN = "secret";

    expect(isValidAdminToken("wrong")).toBe(false);
  });

  it("accepts correct token", () => {
    process.env.ADMIN_TOKEN = "secret";

    expect(isValidAdminToken("secret")).toBe(true);
  });
});

