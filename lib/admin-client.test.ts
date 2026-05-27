import { describe, expect, it } from "vitest";
import { parseMutationResponse } from "@/lib/admin-client";

describe("parseMutationResponse", () => {
  it("returns payload for successful responses", async () => {
    const response = new Response(JSON.stringify({ ok: true }), { status: 200 });

    await expect(parseMutationResponse(response)).resolves.toEqual({
      ok: true,
      payload: { ok: true }
    });
  });

  it("returns clear admin token message for 401", async () => {
    const response = new Response(JSON.stringify({ error: "Admin token required." }), {
      status: 401
    });

    await expect(parseMutationResponse(response)).resolves.toEqual({
      ok: false,
      error: "Admin token required. Save the admin token and retry.",
      payload: { error: "Admin token required." }
    });
  });

  it("falls back for non-json failed responses", async () => {
    const response = new Response("broken", { status: 500 });

    await expect(parseMutationResponse(response)).resolves.toMatchObject({
      ok: false,
      error: "Request failed."
    });
  });
});

