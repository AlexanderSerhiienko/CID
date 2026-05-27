import type { Metadata } from "next";
import Link from "next/link";
import { AdminTokenControl } from "@/components/admin-token-control";
import "./globals.css";

export const metadata: Metadata = {
  title: "Crisis Intelligence Dashboard",
  description: "Reviewed global risk events from RSS and open-data sources"
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
        </div>
      </body>
    </html>
  );
}
