import Link from "next/link";
import { connection } from "next/server";
import { readDb } from "@/lib/db";
import { SiteHeader } from "@/components/SiteHeader";
import { ListingCard } from "@/components/ListingCard";

const STEPS = [
  {
    n: "1",
    title: "Tested at a partner shop",
    body: "The seller brings the part in. Staff run a CPU and GPU stress test, check temperatures, battery and storage health, and record the device fingerprint — while the seller waits.",
  },
  {
    n: "2",
    title: "Pay into escrow",
    body: "You buy from a signed test report, not a stranger's promise. Your money is locked until the part reaches you — the seller can't touch it.",
  },
  {
    n: "3",
    title: "Verified at your door",
    body: "Run the Dibs check on arrival. If it's the exact device the shop tested, the seller is paid. If it was swapped, your money stays protected.",
  },
];

export default async function Home() {
  await connection();
  const listings = readDb().listings.slice().reverse();
  const forSale = listings.filter((l) => l.status === "for_sale");

  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <section className="glow">
          <div className="mx-auto max-w-6xl px-4 pb-16 pt-20 sm:pt-28">
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-amber-300/90">Dibs · trusted used hardware</p>
            <h1 className="mt-4 max-w-3xl text-4xl font-semibold leading-[1.08] tracking-tight text-white sm:text-6xl">
              Used PC parts, <span className="text-amber-300">tested before you pay.</span>
            </h1>
            <p className="mt-6 max-w-2xl text-lg text-zinc-400">
              No more &ldquo;worked when I shipped it&rdquo;. Every listing comes with a stress-test report signed by a partner repair shop,
              and your payment is released only when the device you receive matches the one that was tested.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="#listings" className="rounded-lg bg-amber-400 px-5 py-2.5 font-medium text-black hover:bg-amber-300">
                Browse tested hardware
              </Link>
              <Link href="#how" className="rounded-lg border border-white/12 px-5 py-2.5 font-medium text-zinc-200 hover:border-white/25">
                How it works
              </Link>
            </div>
            <div className="mt-12 flex flex-wrap gap-x-8 gap-y-2 text-sm text-zinc-500">
              <span><b className="text-zinc-200">{listings.length}</b> devices certified</span>
              <span><b className="text-zinc-200">{forSale.length}</b> for sale now</span>
              <span>Escrow on <b className="text-zinc-200">Monad</b></span>
            </div>
          </div>
        </section>

        <section id="listings" className="mx-auto max-w-6xl scroll-mt-16 px-4 py-14">
          <div className="flex items-end justify-between">
            <h2 className="text-2xl font-semibold tracking-tight text-white">Tested hardware</h2>
            <span className="text-sm text-zinc-500">{forSale.length} available</span>
          </div>
          {listings.length === 0 ? (
            <div className="mt-6 rounded-2xl border border-dashed border-white/10 p-12 text-center text-zinc-500">
              No certified devices yet. A partner shop can start a test from the <Link href="/admin" className="text-amber-300 underline-offset-4 hover:underline">staff panel</Link>.
            </div>
          ) : (
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {listings.map((l) => (
                <ListingCard key={l.id} listing={l} />
              ))}
            </div>
          )}
        </section>

        <section id="how" className="scroll-mt-16 border-t border-white/6 bg-white/[0.015]">
          <div className="mx-auto max-w-6xl px-4 py-16">
            <h2 className="text-2xl font-semibold tracking-tight text-white">How Dibs works</h2>
            <div className="mt-8 grid gap-4 md:grid-cols-3">
              {STEPS.map((s) => (
                <div key={s.n} className="rounded-2xl border border-white/8 bg-[#0e0e11] p-6">
                  <div className="grid h-9 w-9 place-items-center rounded-full bg-amber-400/15 font-semibold text-amber-300">{s.n}</div>
                  <h3 className="mt-4 font-semibold text-zinc-100">{s.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-zinc-400">{s.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
      <footer className="border-t border-white/6 py-8 text-center text-xs text-zinc-600">
        Dibs · hackathon prototype · test reports are fingerprinted and anchored on Monad
      </footer>
    </>
  );
}
