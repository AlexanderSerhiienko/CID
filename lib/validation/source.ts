import net from "node:net";
import { SourceType } from "@prisma/client";
import { z } from "zod";

const blockedIpv4Ranges: Array<{ base: number; mask: number }> = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.168.0.0", 16],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4]
].map(([base, prefix]) => ({
  base: ipv4ToNumber(base as string) ?? 0,
  mask: prefixToMask(prefix as number)
}));

const blockedHostnames = new Set(["localhost"]);

function prefixToMask(prefix: number): number {
  return (0xffffffff << (32 - prefix)) >>> 0;
}

function ipv4ToNumber(value: string): number | null {
  const parts = value.split(".").map((part) => Number(part));
  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return null;
  }

  return (
    ((parts[0] << 24) >>> 0) +
    ((parts[1] << 16) >>> 0) +
    ((parts[2] << 8) >>> 0) +
    parts[3]
  ) >>> 0;
}

function isBlockedIpv4(value: string): boolean {
  const address = ipv4ToNumber(value);
  if (address === null) return false;

  return blockedIpv4Ranges.some(({ base, mask }) => (address & mask) === (base & mask));
}

function stripIpv6Brackets(hostname: string): string {
  return hostname.startsWith("[") && hostname.endsWith("]")
    ? hostname.slice(1, -1)
    : hostname;
}

function ipv4FromMappedIpv6(hostname: string): string | null {
  const lower = stripIpv6Brackets(hostname).toLowerCase();
  if (!lower.startsWith("::ffff:")) return null;

  const suffix = lower.slice("::ffff:".length);
  if (net.isIP(suffix) === 4) return suffix;

  const hextets = suffix.split(":");
  if (hextets.length !== 2) return null;

  const high = parseInt(hextets[0], 16);
  const low = parseInt(hextets[1], 16);
  if (
    !Number.isInteger(high) ||
    !Number.isInteger(low) ||
    high < 0 ||
    high > 0xffff ||
    low < 0 ||
    low > 0xffff
  ) {
    return null;
  }

  return [
    (high >> 8) & 0xff,
    high & 0xff,
    (low >> 8) & 0xff,
    low & 0xff
  ].join(".");
}

function isBlockedIpv6(hostname: string): boolean {
  const lower = stripIpv6Brackets(hostname).toLowerCase();
  const mappedIpv4 = ipv4FromMappedIpv6(lower);
  if (mappedIpv4) {
    return isBlockedIpv4(mappedIpv4);
  }

  if (lower === "::" || lower === "::1") return true;

  const firstHextet = lower.split(":")[0];
  if (!firstHextet) return false;

  const value = parseInt(firstHextet, 16);
  if (!Number.isInteger(value)) return false;

  return (
    (value & 0xfe00) === 0xfc00 || // unique local fc00::/7
    (value & 0xffc0) === 0xfe80 // link-local fe80::/10
  );
}

function isBlockedHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/\.$/, "");
  if (blockedHostnames.has(normalized) || normalized.endsWith(".localhost")) {
    return true;
  }

  const ipVersion = net.isIP(stripIpv6Brackets(normalized));
  if (ipVersion === 4) return isBlockedIpv4(normalized);
  if (ipVersion === 6) return isBlockedIpv6(normalized);

  return false;
}

function isAllowedSourceUrl(value: string) {
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) {
      return false;
    }

    return !isBlockedHostname(url.hostname);
  } catch {
    return false;
  }
}

export const createSourceSchema = z.object({
  name: z.string().min(2),
  url: z.string().url().refine(isAllowedSourceUrl, "Source URL must be public HTTP(S)"),
  type: z.nativeEnum(SourceType).default(SourceType.RSS),
  enabled: z.boolean().default(true),
  trustScore: z.number().min(0).max(1).default(0.5)
});

export const updateSourceSchema = createSourceSchema
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided."
  });
