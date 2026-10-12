"use client";

import { useEffect, useState } from "react";
import { Logo } from "@/components/SiteHeader";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("error")) setError("Wrong password");
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        window.location.assign("/admin");
        return;
      }
      setError((await res.json().catch(() => ({}))).error ?? "Login failed");
    } catch {
      setError("Could not reach the server. Try again.");
    }
    setBusy(false);
  }

  return (
    <main className="glow grid flex-1 place-items-center px-4">
      <form method="post" action="/api/admin/login" onSubmit={submit} className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#101013] p-7">
        <Logo />
        <h1 className="mt-6 text-xl font-semibold text-white">Partner shop login</h1>
        <p className="mt-1 text-sm text-zinc-500">Staff panel for running and publishing hardware tests.</p>
        <label className="mt-6 block text-sm text-zinc-400" htmlFor="pw">Password</label>
        <input
          id="pw"
          name="password"
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1.5 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-zinc-100 outline-none focus:border-amber-300/50"
        />
        {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
        <button type="submit" disabled={busy} className="mt-5 w-full rounded-lg bg-amber-400 py-2.5 font-medium text-black hover:bg-amber-300 disabled:opacity-60">
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
