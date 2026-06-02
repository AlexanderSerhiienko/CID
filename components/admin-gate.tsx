"use client";

import { KeyRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { setAdminToken } from "@/lib/admin-client";

// Unlock form shown by server components when the admin cookie is missing/invalid.
// On submit it stores the token (localStorage + cookie) and refreshes so the server
// re-reads the cookie and renders the protected content.
export function AdminGate() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [error, setError] = useState(false);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = token.trim();
    if (!trimmed) {
      setError(true);
      return;
    }
    setAdminToken(trimmed);
    router.refresh();
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-lg border border-[#2d2d2d] bg-[#1a1a1a] p-8">
        <div className="mb-6 flex flex-col items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full border border-[#424754] bg-[#191b23]">
            <KeyRound className="h-5 w-5 text-[#8c909f]" />
          </div>
          <div className="text-center">
            <h2 className="text-base font-semibold text-[#e1e2ec]">Admin access required</h2>
            <p className="mt-1 text-xs text-[#8c909f]">Enter your admin token to view the review queue.</p>
          </div>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <input
            autoFocus
            value={token}
            onChange={(e) => { setToken(e.target.value); setError(false); }}
            type="password"
            placeholder="Admin token"
            className={`h-9 w-full rounded border bg-[#191b23] px-3 text-sm text-[#e1e2ec] placeholder-[#8c909f] focus:outline-none transition-colors ${
              error ? "border-[#ffb4ab] focus:border-[#ffb4ab]" : "border-[#2d2d2d] focus:border-[#3b82f6]"
            }`}
          />
          {error && (
            <p className="text-xs text-[#ffb4ab]">Token cannot be empty.</p>
          )}
          <button
            type="submit"
            className="h-9 w-full rounded border border-[#3b82f6]/40 bg-[#3b82f6]/10 text-sm font-medium text-[#3b82f6] hover:bg-[#3b82f6]/20 transition-colors"
          >
            Unlock
          </button>
        </form>
      </div>
    </div>
  );
}
