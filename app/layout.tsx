import type { Metadata } from "next";
import Link from "next/link";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { AdminTokenControl } from "@/components/admin-token-control";
import "./globals.css";

export const metadata: Metadata = {
  title: "Crisis Intelligence Dashboard",
  description: "Reviewed global risk events from RSS and open-data sources",
  alternates: {
    types: {
      "application/rss+xml": "/api/events/feed"
    }
  }
};

const navItems = [
  { href: "/", label: "Dashboard" },
  { href: "/events", label: "Events" },
  { href: "/sources", label: "Sources" },
  { href: "/admin/review", label: "Review" }
];

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <div className="min-h-screen">
          <header className="border-b border-border bg-card">
            <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4">
              <Link href="/" className="font-semibold tracking-normal">
                Crisis Intelligence
              </Link>
              <div className="flex items-center gap-3">
                <nav className="flex items-center gap-2 text-sm text-muted-foreground">
                  {navItems.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="rounded-md px-3 py-2 hover:bg-muted hover:text-foreground"
                    >
                      {item.label}
                    </Link>
                  ))}
                </nav>
                <AdminTokenControl />
              </div>
            </div>
          </header>
          <main className="mx-auto max-w-7xl px-5 py-6">{children}</main>
          <footer className="border-t border-border bg-card mt-8">
            <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-3 text-xs text-muted-foreground">
              <span>Crisis Intelligence Dashboard</span>
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
              <a
                href="/api/events/feed"
                className="flex items-center gap-1.5 hover:text-foreground"
                title="Subscribe to RSS feed of published events"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <path d="M6.18 15.64a2.18 2.18 0 0 1 2.18 2.18C8.36 19.01 7.38 20 6.18 20C4.98 20 4 19.01 4 17.82a2.18 2.18 0 0 1 2.18-2.18M4 4.44A15.56 15.56 0 0 1 19.56 20h-2.83A12.73 12.73 0 0 0 4 7.27V4.44m0 5.66a9.9 9.9 0 0 1 9.9 9.9h-2.83A7.07 7.07 0 0 0 4 12.93V10.1z"/>
                </svg>
                RSS feed
              </a>
            </div>
          </footer>
        </div>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
