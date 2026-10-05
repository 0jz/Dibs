import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { readDb } from "@/lib/db";
import { GRADE_INFO, date, money, shortHash } from "@/lib/format";
import { SiteHeader } from "@/components/SiteHeader";
import { ResultStats, SpecList, TelemetryPanel } from "@/components/ReportView";
import { CopyCommand } from "@/components/CopyCommand";

export default async function ListingPage({ params }: PageProps<"/listing/[id]">) {
  const { id } = await params;
  const db = readDb();
  const listing = db.listings.find((l) => l.id === id);
  if (!listing) notFound();

  const verifications = db.verifications.filter((v) => v.listingId === id).reverse();
  const host = (await headers()).get("host") ?? "localhost:3000";
  const server = `http://${host}`;
  const grade = GRADE_INFO[listing.grade];
  const part = listing.kind === "part";

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10">
        <Link href="/#listings" className="text-sm text-zinc-500 hover:text-zinc-300">← All tested hardware</Link>

        <div className="mt-4 grid gap-8 lg:grid-cols-[1fr_340px]">
          {/* Report */}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-0.5 text-xs text-emerald-300">✓ Tested at {listing.store}</span>
              <span className={`rounded-full border px-2.5 py-0.5 text-xs ${grade.tone}`}>Grade {listing.grade} · {grade.label}</span>
              {listing.status === "sold" && <span className="rounded-full border border-red-400/30 bg-red-400/10 px-2.5 py-0.5 text-xs text-red-300">Sold</span>}
            </div>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">{listing.title}</h1>
            <p className="mt-2 text-sm text-zinc-500">Sold by {listing.seller} · tested {date(listing.testedAt)}</p>

            {listing.notes && (
              <blockquote className="mt-6 rounded-xl border-l-2 border-amber-300/60 bg-amber-300/5 px-4 py-3 text-sm text-zinc-300">
                <div className="mb-1 text-xs uppercase tracking-wider text-amber-300/80">Technician notes</div>
                {listing.notes}
              </blockquote>
            )}

            <h2 className="mt-10 text-lg font-semibold text-zinc-100">Test results</h2>
            <div className="mt-4">
              <ResultStats identity={listing.identity} results={listing.results} gpuScore={listing.gpuScore} memoryScore={listing.memoryScore} kind={listing.kind} />
            </div>

            <h2 className="mt-10 text-lg font-semibold text-zinc-100">Stress test telemetry</h2>
            <div className="mt-4">
              <TelemetryPanel samples={listing.samples} />
            </div>

            <h2 className="mt-10 text-lg font-semibold text-zinc-100">Detected hardware</h2>
            <p className="mt-1 text-sm text-zinc-500">Read directly from the device by the Dibs agent — not typed in by the seller.</p>
            <div className="mt-3 rounded-xl border border-white/8 bg-white/[0.02] px-4">
              <SpecList identity={listing.identity} kind={listing.kind} />
            </div>
          </div>

          {/* Sidebar */}
          <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
              <div className="text-3xl font-semibold text-white">{money(listing.price, listing.currency)}</div>
              <button
                disabled
                className="mt-4 w-full cursor-not-allowed rounded-lg bg-amber-400/90 px-4 py-2.5 font-medium text-black opacity-60"
                title="Escrow contract is the next build step"
              >
                Buy with escrow
              </button>
              <p className="mt-3 text-xs leading-relaxed text-zinc-500">
                Payment is held in USDC escrow on Solana and released to the seller only after the delivery check matches. (Escrow contract
                coming next.)
              </p>
            </div>

            <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-5 text-sm">
              <h3 className="font-semibold text-zinc-100">Certificate</h3>
              <dl className="mt-3 space-y-2.5">
                <div className="flex justify-between gap-3"><dt className="text-zinc-500">Store</dt><dd className="text-right text-zinc-200">{listing.store}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-zinc-500">Seal ID</dt><dd className="font-mono text-zinc-200">{listing.sealId || "—"}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-zinc-500">{part ? "GPU fingerprint" : "Device fingerprint"}</dt><dd className="font-mono text-zinc-200" title={listing.deviceHash}>{shortHash(listing.deviceHash)}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-zinc-500">Report hash</dt><dd className="font-mono text-zinc-200" title={listing.reportHash}>{shortHash(listing.reportHash)}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-zinc-500">On-chain</dt><dd className="text-amber-300/90">pending anchor</dd></div>
              </dl>
            </div>

            <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-5 text-sm">
              <h3 className="font-semibold text-zinc-100">Delivery check</h3>
              <p className="mt-2 text-zinc-400">
                {part
                  ? "When it arrives, install the card and run this on that PC. It confirms it's the exact card the shop tested."
                  : "When it arrives, run this on the device. It confirms it's the exact one the shop tested."}
              </p>
              <div className="mt-3">
                <CopyCommand command={`python dibs_agent.py verify --server ${server} --listing ${listing.id}`} />
              </div>
              <a href="/dibs_agent.py" download className="mt-2 inline-block text-xs text-amber-300 hover:underline">Download dibs_agent.py</a>
              {verifications.length > 0 && (
                <ul className="mt-4 space-y-2 border-t border-white/6 pt-4">
                  {verifications.map((v) => (
                    <li key={v.id} className="flex items-start justify-between gap-2">
                      <span className={v.match ? "text-emerald-300" : "text-red-400"}>{v.match ? "✓ Match" : "✕ Mismatch"}</span>
                      <span className="text-right text-xs text-zinc-500">{date(v.at)}<br />{v.summary.model}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </aside>
        </div>
      </main>
    </>
  );
}
