"use client";

import { KeyRound } from "lucide-react";
import { useEffect, useState } from "react";
import { ADMIN_TOKEN_STORAGE_KEY } from "@/lib/admin-client";

export function AdminTokenControl() {
  const [token, setToken] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setToken(window.localStorage.getItem(ADMIN_TOKEN_STORAGE_KEY) ?? "");
  }, []);

  function save() {
    if (token.trim()) {
      window.localStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, token.trim());
      setSaved(true);
      return;
    }

    window.localStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY);
    setSaved(false);
  }

  return (
    <div className="flex items-center gap-2">
      <KeyRound className="h-4 w-4 text-muted-foreground" />
      <input
        value={token}
        onChange={(event) => {
          setToken(event.target.value);
          setSaved(false);
        }}
        placeholder="Admin token"
        type="password"
        className="h-9 w-32 rounded-md border border-border bg-background px-2 text-xs md:w-44"
      />
      <button
        type="button"
        onClick={save}
        className="h-9 rounded-md border border-border bg-card px-2 text-xs hover:bg-muted"
      >
        {saved ? "Saved" : "Save"}
      </button>
    </div>
  );
}

