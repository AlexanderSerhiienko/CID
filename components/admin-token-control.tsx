"use client";

import { KeyRound } from "lucide-react";
import { useEffect, useState } from "react";
import { ADMIN_TOKEN_STORAGE_KEY, setAdminToken, clearAdminToken } from "@/lib/admin-client";

export function AdminTokenControl() {
  const [token, setToken] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setToken(window.localStorage.getItem(ADMIN_TOKEN_STORAGE_KEY) ?? "");
  }, []);

  function save() {
    if (token.trim()) {
      setAdminToken(token.trim());
      setSaved(true);
      return;
    }

    clearAdminToken();
    setSaved(false);
  }

  return (
    <div className="flex items-center gap-2">
      <KeyRound className="h-3.5 w-3.5 text-[#8c909f]" />
      <input
        value={token}
        onChange={(event) => {
          setToken(event.target.value);
          setSaved(false);
        }}
        placeholder="Admin token"
        type="password"
        className="h-8 w-32 rounded border border-[#2d2d2d] bg-[#191b23] px-2 text-xs text-[#e1e2ec] placeholder-[#8c909f] focus:outline-none focus:border-[#3b82f6] md:w-40 transition-colors"
      />
      <button
        type="button"
        onClick={save}
        className="h-8 rounded border border-[#2d2d2d] bg-[#272a31] px-2.5 text-xs text-[#c2c6d6] hover:border-[#424754] hover:text-[#e1e2ec] transition-colors"
      >
        {saved ? "✓ Saved" : "Save"}
      </button>
    </div>
  );
}

