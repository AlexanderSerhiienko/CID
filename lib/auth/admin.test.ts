import { afterEach, describe, expect, it } from "vitest";
import { isAdminAuthConfigured, isValidAdminToken } from "@/lib/auth/admin";

const originalAdminToken = process.env.ADMIN_TOKEN;

afterEach(() => {
  process.env.ADMIN_TOKEN = originalAdminToken;
});

describe("admin auth", () => {
  it("denies requests when admin auth is not configured in test/production env", () => {
    // NODE_ENV=test in Vitest — passthrough is only allowed for NODE_ENV=development.
    delete process.env.ADMIN_TOKEN;

    expect(isAdminAuthConfigured()).toBe(false);
    expect(isValidAdminToken(undefined)).toBe(false);
  });

  it("allows passthrough in development when admin auth is not configured", () => {
    const original = process.env.NODE_ENV;
    // NODE_ENV is read-only in TypeScript types but writable at runtime in Node/Vitest
    (process.env as Record<string, string | undefined>).NODE_ENV = "development";
    delete process.env.ADMIN_TOKEN;

    expect(isValidAdminToken(undefined)).toBe(true);

    (process.env as Record<string, string | undefined>).NODE_ENV = original;
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

