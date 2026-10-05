"use client";

import { useRouter } from "next/navigation";

export function LogoutButton() {
  const router = useRouter();
  return (
    <button
      onClick={async () => {
        await fetch("/api/admin/logout", { method: "POST" });
        router.replace("/admin/login");
      }}
      className="rounded-md px-3 py-1.5 hover:bg-white/5 hover:text-zinc-100"
    >
      Log out
    </button>
  );
}
