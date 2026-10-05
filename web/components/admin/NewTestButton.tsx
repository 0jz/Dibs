"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function NewTestButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        const res = await fetch("/api/sessions", { method: "POST" });
        if (res.ok) router.push(`/admin/session/${(await res.json()).id}`);
        else setBusy(false);
      }}
      className="rounded-lg bg-amber-400 px-4 py-2.5 font-medium text-black hover:bg-amber-300 disabled:opacity-60"
    >
      {busy ? "Starting…" : "+ Start new test"}
    </button>
  );
}
