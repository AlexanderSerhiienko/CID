import type { Metadata } from "next";
import Link from "next/link";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { AdminTokenControl } from "@/components/admin-token-control";
import { AdminNavLink } from "@/components/admin-nav-link";
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
  { href: "/events", label: "Events Table" },
  { href: "/sources", label: "Sources" }
];

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark">
      <body>
        <header className="fixed top-0 left-0 right-0 z-50 h-14 flex items-center justify-between px-6 border-b border-[#2d2d2d] bg-[#1d2027]">
          <div className="flex items-center gap-8">
            <Link href="/" className="text-lg font-semibold text-[#e1e2ec] tracking-tight">
              Crisis Intelligence
            </Link>
            <nav className="hidden md:flex items-center gap-6">
              <AdminNavLink />
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="text-xs font-semibold uppercase tracking-widest text-[#c2c6d6] hover:text-[#3b82f6] transition-colors duration-200"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <AdminTokenControl />
            <a
              href="/api/events/feed"
              className="text-[#8c909f] hover:text-[#3b82f6] transition-colors"
              title="RSS feed"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M6.18 15.64a2.18 2.18 0 0 1 2.18 2.18C8.36 19.01 7.38 20 6.18 20C4.98 20 4 19.01 4 17.82a2.18 2.18 0 0 1 2.18-2.18M4 4.44A15.56 15.56 0 0 1 19.56 20h-2.83A12.73 12.73 0 0 0 4 7.27V4.44m0 5.66a9.9 9.9 0 0 1 9.9 9.9h-2.83A7.07 7.07 0 0 0 4 12.93V10.1z"/>
              </svg>
            </a>
          </div>
        </header>
        <div className="pt-14">{children}</div>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
