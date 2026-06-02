import { NextRequest } from "next/server";
import { afterEach, describe, expect, it } from "vitest";
import { authorizeCron } from "@/lib/auth/cron";

const originalCronSecret = process.env.CRON_SECRET;

afterEach(() => {
  if (originalCronSecret === undefined) {
    delete process.env.CRON_SECRET;
  } else {
    process.env.CRON_SECRET = originalCronSecret;
  }
});

function cronRequest(authHeader?: string): NextRequest {
  const headers = new Headers();
  if (authHeader) {
    headers.set("authorization", authHeader);
  }
  return new NextRequest("http://localhost/api/cron/ingest", { method: "GET", headers });
}

describe("authorizeCron", () => {
  it("returns null when CRON_SECRET is not set", () => {
    delete process.env.CRON_SECRET;
    expect(authorizeCron(cronRequest("Bearer anything"))).toBeNull();
  });

  it("returns null when the Authorization header does not match", () => {
    process.env.CRON_SECRET = "secret";
    expect(authorizeCron(cronRequest("Bearer wrong"))).toBeNull();
  });

  it("returns null when the Authorization header is missing", () => {
    process.env.CRON_SECRET = "secret";
    expect(authorizeCron(cronRequest())).toBeNull();
  });

  it("returns the validated secret when the header matches", () => {
    process.env.CRON_SECRET = "secret";
    expect(authorizeCron(cronRequest("Bearer secret"))).toBe("secret");
  });
});
