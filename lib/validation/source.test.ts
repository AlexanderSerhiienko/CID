import { describe, expect, it } from "vitest";
import { SourceType } from "@prisma/client";
import { createSourceSchema, updateSourceSchema } from "@/lib/validation/source";

describe("createSourceSchema", () => {
  it("accepts public HTTP feed sources", () => {
    const result = createSourceSchema.safeParse({
      name: "Example Feed",
      url: "https://example.com/rss.xml",
      type: SourceType.RSS,
      trustScore: 0.7,
      enabled: true
    });

    expect(result.success).toBe(true);
  });

  it("rejects IPv6 loopback URLs to prevent SSRF", () => {
    const result = createSourceSchema.safeParse({
      name: "IPv6 Feed",
      url: "http://[::1]/rss.xml",
      type: SourceType.RSS,
      trustScore: 0.5,
      enabled: true
    });

    expect(result.success).toBe(false);
  });

  it("rejects private localhost URLs", () => {
    const result = createSourceSchema.safeParse({
      name: "Local Feed",
      url: "http://localhost:3000/rss.xml",
      type: SourceType.RSS,
      trustScore: 0.7,
      enabled: true
    });

    expect(result.success).toBe(false);
  });

  it("rejects link-local IPv4 URLs to prevent metadata-service SSRF", () => {
    const result = createSourceSchema.safeParse({
      name: "Metadata Feed",
      url: "http://169.254.169.254/latest/meta-data",
      type: SourceType.RSS,
      trustScore: 0.5,
      enabled: true
    });

    expect(result.success).toBe(false);
  });

  it("rejects IPv4-mapped IPv6 loopback URLs to prevent SSRF bypasses", () => {
    const result = createSourceSchema.safeParse({
      name: "Mapped Loopback Feed",
      url: "http://[::ffff:127.0.0.1]/rss.xml",
      type: SourceType.RSS,
      trustScore: 0.5,
      enabled: true
    });

    expect(result.success).toBe(false);
  });

  it("rejects IPv6 link-local URLs to prevent SSRF bypasses", () => {
    const result = createSourceSchema.safeParse({
      name: "IPv6 Link Local Feed",
      url: "http://[fe80::1]/rss.xml",
      type: SourceType.RSS,
      trustScore: 0.5,
      enabled: true
    });

    expect(result.success).toBe(false);
  });

  it("rejects invalid trust scores", () => {
    const result = createSourceSchema.safeParse({
      name: "Bad Trust",
      url: "https://example.com/rss.xml",
      type: SourceType.RSS,
      trustScore: 1.5,
      enabled: true
    });

    expect(result.success).toBe(false);
  });
});

describe("updateSourceSchema", () => {
  it("allows partial updates", () => {
    const result = updateSourceSchema.safeParse({
      enabled: false
    });

    expect(result.success).toBe(true);
  });
});
