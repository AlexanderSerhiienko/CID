"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ADMIN_TOKEN_STORAGE_KEY } from "@/lib/admin-client";

export function AdminNavLink() {
  const [hasToken, setHasToken] = useState(false);

  useEffect(() => {
    const check = () =>
      setHasToken(!!window.localStorage.getItem(ADMIN_TOKEN_STORAGE_KEY));
    check();
    window.addEventListener("storage", check);
    return () => window.removeEventListener("storage", check);
  }, []);

  if (!hasToken) return null;

  return (
    <Link
      href="/admin/review"
      className="text-xs font-semibold uppercase tracking-widest text-[#c2c6d6] hover:text-[#3b82f6] transition-colors duration-200"
    >
      Admin Review
    </Link>
  );
}
