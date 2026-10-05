"use client";

import { useRouter } from "next/navigation";

export function ListingStatusButton({ id, status }: { id: string; status: "for_sale" | "sold" }) {
  const router = useRouter();
  const next = status === "for_sale" ? "sold" : "for_sale";
  return (
    <button
      onClick={async () => {
        await fetch(`/api/listings/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: next }),
        });
        router.refresh();
      }}
      className="rounded-md border border-white/10 px-2.5 py-1 text-xs text-zinc-300 hover:border-white/25"
    >
      {status === "for_sale" ? "Mark sold" : "Relist"}
    </button>
  );
}
