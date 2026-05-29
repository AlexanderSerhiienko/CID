/**
 * GET /api/events/feed  (also reachable as /api/events/feed.xml via next.config rewrite)
 *
 * Standard RSS 2.0 feed of the 50 most recent published risk events.
 * Supports optional ?category= filter.
 *
 * No auth required — publicly readable.
 * Cache-Control: 1 hour (matches daily ingestion cadence, generous margin).
 *
 * Note: Next.js App Router does not support dots in route segment directory names,
 * so the canonical path is /api/events/feed. A rewrite in next.config.ts maps
 * /api/events/feed.xml to this handler for feed reader compatibility.
 */
import { EventCategory, EventStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

const FEED_LIMIT = 50;
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? "https://crisis-intelligence-dashboard.vercel.app";

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function rfc822(date: Date): string {
  return date.toUTCString();
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const categoryParam = searchParams.get("category");

  const parsedCategory =
    categoryParam && Object.values(EventCategory).includes(categoryParam as EventCategory)
      ? (categoryParam as EventCategory)
      : undefined;

  const events = await prisma.riskEvent.findMany({
    where: {
      status: EventStatus.PUBLISHED,
      category: parsedCategory
    },
    orderBy: [{ createdAt: "desc" }, { occurredAt: "desc" }],
    take: FEED_LIMIT,
    select: {
      id: true,
      title: true,
      summary: true,
      category: true,
      severity: true,
      country: true,
      city: true,
      sourceUrl: true,
      occurredAt: true,
      createdAt: true
    }
  });

  const categoryLabel = parsedCategory
    ? parsedCategory.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
    : "All Categories";

  const feedTitle = parsedCategory
    ? `Crisis Intelligence Dashboard — ${categoryLabel}`
    : "Crisis Intelligence Dashboard";

  const feedDescription = parsedCategory
    ? `Published risk events: ${categoryLabel}`
    : "Published risk events from official feeds and open-data sources";

  const lastBuildDate = events[0] ? rfc822(events[0].occurredAt ?? events[0].createdAt) : rfc822(new Date());

  const items = events
    .map((event) => {
      const pubDate = rfc822(event.occurredAt ?? event.createdAt);
      const location = [event.city, event.country].filter(Boolean).join(", ") || "Location pending";
      const link = `${BASE_URL}/events/${escapeXml(event.id)}`;
      const description = escapeXml(
        `[${event.severity}] ${event.summary} — ${location}`
      );

      return `    <item>
      <title>${escapeXml(event.title)}</title>
      <link>${link}</link>
      <guid isPermaLink="true">${link}</guid>
      <pubDate>${pubDate}</pubDate>
      <description>${description}</description>
      <category>${escapeXml(event.category.replace(/_/g, " "))}</category>
    </item>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(feedTitle)}</title>
    <link>${BASE_URL}</link>
    <description>${escapeXml(feedDescription)}</description>
    <language>en-us</language>
    <lastBuildDate>${lastBuildDate}</lastBuildDate>
    <atom:link href="${BASE_URL}/api/events/feed${parsedCategory ? `?category=${parsedCategory}` : ""}" rel="self" type="application/rss+xml"/>
${items}
  </channel>
</rss>`;

  return new NextResponse(xml, {
    status: 200,
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600"
    }
  });
}
