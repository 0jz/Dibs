import Link from "next/link";
import type { Listing } from "@/lib/types";
import { GRADE_INFO, cleanName, money, tempTone } from "@/lib/format";

export function ListingCard({ listing }: { listing: Listing }) {
  const gpu = listing.identity.gpus[0];
  const grade = GRADE_INFO[listing.grade];
  const part = listing.kind === "part";
  return (
    <Link
      href={`/listing/${listing.id}`}
      className="group flex flex-col rounded-2xl border border-white/8 bg-white/[0.03] p-5 transition hover:border-amber-300/30 hover:bg-white/[0.05]"
    >
      <div className="flex items-start justify-between gap-3">
        <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-0.5 text-xs text-emerald-300">
          ✓ Store tested
        </span>
        <span className={`rounded-full border px-2.5 py-0.5 text-xs ${grade.tone}`}>
          Grade {listing.grade} · {grade.label}
        </span>
      </div>
      <h3 className="mt-4 text-lg font-semibold leading-snug text-zinc-100 group-hover:text-white">{listing.title}</h3>
      <p className="mt-1 text-sm text-zinc-400">
        {part ? (
          `Graphics card · ${Math.round(gpu.vramMb / 1024)} GB VRAM`
        ) : (
          <>
            {gpu ? gpu.name.replace(/^NVIDIA GeForce /, "") + " · " : ""}
            {cleanName(listing.identity.cpu.name).replace(/^Intel Core |^AMD Ryzen /, "")} · {listing.identity.ram.totalGb} GB
          </>
        )}
      </p>
      <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
        <div className="rounded-lg bg-black/30 py-2">
          <div className={`text-sm font-semibold ${tempTone(listing.results.gpu?.maxTemp)}`}>
            {listing.results.gpu ? `${listing.results.gpu.maxTemp}°C` : "—"}
          </div>
          <div className="text-zinc-500">peak temp</div>
        </div>
        <div className="rounded-lg bg-black/30 py-2">
          <div className="text-sm font-semibold text-zinc-200">{listing.gpuScore ? listing.gpuScore.fps : "—"}</div>
          <div className="text-zinc-500">GPU fps</div>
        </div>
        <div className="rounded-lg bg-black/30 py-2">
          {part ? (
            <>
              <div className={`text-sm font-semibold ${listing.results.gpu?.throttleSamples ? "text-red-400" : "text-emerald-300"}`}>
                {listing.results.gpu ? (listing.results.gpu.throttleSamples ? "Yes" : "None") : "—"}
              </div>
              <div className="text-zinc-500">throttling</div>
            </>
          ) : (
            <>
              <div className="text-sm font-semibold text-zinc-200">
                {listing.identity.battery ? `${Math.round(listing.identity.battery.healthPct)}%` : (listing.results.cpu.multiScore / 1000).toFixed(1) + "k"}
              </div>
              <div className="text-zinc-500">{listing.identity.battery ? "battery" : "CPU score"}</div>
            </>
          )}
        </div>
      </div>
      <div className="mt-5 flex items-end justify-between border-t border-white/6 pt-4">
        <div className="text-2xl font-semibold text-zinc-100">{money(listing.price, listing.currency)}</div>
        <div className="text-right text-xs text-zinc-500">
          {listing.status === "sold" ? <span className="text-red-300">Sold</span> : listing.store}
        </div>
      </div>
    </Link>
  );
}
