import Link from "next/link";
import { headers } from "next/headers";
import { readDb } from "@/lib/db";
import { date } from "@/lib/format";
import { SiteHeader } from "@/components/SiteHeader";
import { CopyCommand } from "@/components/CopyCommand";

export default async function VerifyPage() {
  const host = (await headers()).get("host") ?? "localhost:3000";
  const db = readDb();
  const recent = db.verifications.slice(-8).reverse();
  const title = (id: string) => db.listings.find((l) => l.id === id)?.title ?? "Unknown listing";

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-14">
        <h1 className="text-3xl font-semibold tracking-tight text-white">Verify your delivery</h1>
        <p className="mt-3 text-zinc-400">
          Your payment stays in escrow until you confirm the delivery. The Dibs check reads the hardware fingerprint and compares it
          with the one the partner shop recorded. A graphics card is identified by its unique GPU ID and firmware, so it works in
          your own PC; a laptop or prebuilt is also tied to its BIOS serial. Swapped part? It won&apos;t match.
        </p>

        <ol className="mt-8 space-y-5">
          <li className="rounded-xl border border-white/8 bg-white/[0.02] p-5">
            <div className="font-semibold text-zinc-100">1. Download the check tool</div>
            <p className="mt-1 text-sm text-zinc-400">Needs Python 3 on Windows. No install, no account.</p>
            <a href="/dibs_agent.py" download className="mt-3 inline-block rounded-lg bg-amber-400 px-4 py-2 text-sm font-medium text-black hover:bg-amber-300">
              Download dibs_agent.py
            </a>
          </li>
          <li className="rounded-xl border border-white/8 bg-white/[0.02] p-5">
            <div className="font-semibold text-zinc-100">2. Run it on the delivered device</div>
            <p className="mt-1 text-sm text-zinc-400">
              Bought a card? Install it first, then run this on that PC. Use the listing ID from your order page (it&apos;s also in
              the listing&apos;s URL).
            </p>
            <div className="mt-3">
              <CopyCommand command={`python dibs_agent.py verify --server http://${host} --listing <listing-id>`} />
            </div>
          </li>
          <li className="rounded-xl border border-white/8 bg-white/[0.02] p-5">
            <div className="font-semibold text-zinc-100">3. Match → seller gets paid. Mismatch → dispute.</div>
            <p className="mt-1 text-sm text-zinc-400">
              A mismatch never refunds instantly — the device goes back to a partner shop for a re-check, so nobody can game the system.
            </p>
          </li>
        </ol>

        {recent.length > 0 && (
          <section className="mt-12">
            <h2 className="text-lg font-semibold text-zinc-100">Recent checks</h2>
            <ul className="mt-4 divide-y divide-white/6 rounded-xl border border-white/8">
              {recent.map((v) => (
                <li key={v.id} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
                  <Link href={`/listing/${v.listingId}`} className="truncate text-zinc-300 hover:text-white">{title(v.listingId)}</Link>
                  <span className="flex shrink-0 items-center gap-3">
                    <span className="text-xs text-zinc-500">{date(v.at)}</span>
                    <span className={v.match ? "text-emerald-300" : "text-red-400"}>{v.match ? "✓ Match" : "✕ Mismatch"}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </>
  );
}
