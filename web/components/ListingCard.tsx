import Link from "next/link";
import type { Listing } from "@/lib/types";
import { GRADE_INFO, cleanName, money, tempTone } from "@/lib/format";

export function ListingCard({ listing, middle }: { listing: Listing; middle: { value: string; label: string } }) {
  const gpu = listing.identity.gpus[0];
  const grade = GRADE_INFO[listing.grade];
  const scope = listing.saleScope ?? (listing.kind === "part" ? "gpu" : "device");
  const showGpuHealth = scope === "gpu" || scope === "device";
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
        {scope === "gpu" && gpu ? (
          `Graphics card · ${Math.round(gpu.vramMb / 1024)} GB VRAM`
        ) : scope === "cpu" ? (
          cleanName(listing.identity.cpu.name)
        ) : scope === "ram" ? (
          `${listing.identity.ram.totalGb} GB memory`
        ) : scope === "storage" ? (
          listing.identity.disks[0]?.model ?? "Storage"
        ) : scope === "battery" ? (
          "Battery"
        ) : (
          <>
            {gpu ? gpu.name.replace(/^NVIDIA GeForce /, "") + " · " : ""}
            {cleanName(listing.identity.cpu.name).replace(/^Intel Core |^AMD Ryzen /, "")} · {listing.identity.ram.totalGb} GB
          </>
        )}
      </p>
      <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
        <div className="rounded-lg bg-black/30 py-2">
          {showGpuHealth ? (
            <>
              <div className={`text-sm font-semibold ${tempTone(listing.results.gpu?.maxTemp)}`}>
                {listing.results.gpu ? `${listing.results.gpu.maxTemp}°C` : "—"}
              </div>
              <div className="text-zinc-500">peak temp</div>
            </>
          ) : scope === "cpu" ? (
            <>
              <div className="text-sm font-semibold text-zinc-200">{listing.results.cpu.singleScore.toLocaleString("en-US")}</div>
              <div className="text-zinc-500">single</div>
            </>
          ) : scope === "ram" ? (
            <>
              <div className="text-sm font-semibold text-zinc-200">{listing.identity.ram.modules[0]?.speedMts ?? "—"}</div>
              <div className="text-zinc-500">MT/s</div>
            </>
          ) : scope === "storage" ? (
            <>
              <div className="text-sm font-semibold text-zinc-200">{listing.identity.disks[0]?.sizeGb ?? "—"}</div>
              <div className="text-zinc-500">GB</div>
            </>
          ) : (
            <>
              <div className="text-sm font-semibold text-zinc-200">{listing.identity.battery?.cycles ?? "—"}</div>
              <div className="text-zinc-500">cycles</div>
            </>
          )}
        </div>
        <div className="rounded-lg bg-black/30 py-2">
          <div className="text-sm font-semibold text-zinc-200">{middle.value}</div>
          <div className="text-zinc-500">{middle.label}</div>
        </div>
        <div className="rounded-lg bg-black/30 py-2">
          {showGpuHealth ? (
            <>
              <div className={`text-sm font-semibold ${listing.results.gpu?.throttleSamples ? "text-red-400" : "text-emerald-300"}`}>
                {listing.results.gpu ? (listing.results.gpu.throttleSamples ? "Yes" : "None") : "—"}
              </div>
              <div className="text-zinc-500">throttling</div>
            </>
          ) : scope === "cpu" ? (
            <>
              <div className="text-sm font-semibold text-zinc-200">{listing.identity.cpu.threads}</div>
              <div className="text-zinc-500">threads</div>
            </>
          ) : scope === "ram" ? (
            <>
              <div className="text-sm font-semibold text-zinc-200">{listing.identity.ram.modules.length}</div>
              <div className="text-zinc-500">modules</div>
            </>
          ) : scope === "storage" ? (
            <>
              <div className="text-sm font-semibold text-zinc-200">{listing.identity.disks[0]?.type || "—"}</div>
              <div className="text-zinc-500">type</div>
            </>
          ) : (
            <>
              <div className="text-sm font-semibold text-zinc-200">
                {listing.identity.battery ? (listing.identity.battery.designMwh / 1000).toFixed(0) : "—"}
              </div>
              <div className="text-zinc-500">Wh</div>
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
