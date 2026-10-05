import Link from "next/link";
import { connection } from "next/server";
import { readDb } from "@/lib/db";
import { date, money } from "@/lib/format";
import { NewTestButton } from "@/components/admin/NewTestButton";
import { ListingStatusButton } from "@/components/admin/ListingStatusButton";
import type { SessionStatus } from "@/lib/types";

const STATUS: Record<SessionStatus, { label: string; tone: string }> = {
  waiting: { label: "Waiting for device", tone: "text-zinc-400 bg-white/5" },
  testing: { label: "Testing", tone: "text-sky-300 bg-sky-400/10" },
  done: { label: "Ready to review", tone: "text-amber-200 bg-amber-300/10" },
  published: { label: "Published", tone: "text-emerald-300 bg-emerald-400/10" },
};

export default async function Dashboard() {
  await connection();
  const db = readDb();
  const sessions = db.sessions.slice().reverse();
  const listings = db.listings.slice().reverse();
  const pending = sessions.filter((s) => s.status !== "published");

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">Test bench</h1>
          <p className="mt-1 text-sm text-zinc-500">Start a test, run the agent on the customer&apos;s device, review and publish.</p>
        </div>
        <NewTestButton />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ["Tests in progress", pending.length],
          ["Devices certified", listings.length],
          ["Delivery checks", db.verifications.length],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-white/8 bg-white/[0.03] p-4">
            <div className="text-xs uppercase tracking-wider text-zinc-500">{label}</div>
            <div className="mt-1 text-3xl font-semibold text-white">{value}</div>
          </div>
        ))}
      </div>

      <section>
        <h2 className="text-lg font-semibold text-zinc-100">Test sessions</h2>
        {sessions.length === 0 ? (
          <p className="mt-3 rounded-xl border border-dashed border-white/10 p-8 text-center text-sm text-zinc-500">
            No tests yet. Click <b className="text-zinc-300">Start new test</b> when a customer brings a device in.
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-xl border border-white/8">
            <table className="w-full text-sm">
              <thead className="bg-white/[0.03] text-left text-xs uppercase tracking-wider text-zinc-500">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Code</th>
                  <th className="px-4 py-2.5 font-medium">Device</th>
                  <th className="px-4 py-2.5 font-medium">Started</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th />
                </tr>
              </thead>
              <tbody className="divide-y divide-white/6">
                {sessions.map((s) => (
                  <tr key={s.id} className="hover:bg-white/[0.02]">
                    <td className="px-4 py-3 font-mono text-zinc-200">{s.code}</td>
                    <td className="px-4 py-3 text-zinc-300">
                      {s.identity ? `${s.identity.system.manufacturer} ${s.identity.system.model}` : <span className="text-zinc-600">—</span>}
                    </td>
                    <td className="px-4 py-3 text-zinc-500">{date(s.createdAt)}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs ${STATUS[s.status].tone}`}>{STATUS[s.status].label}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link href={`/admin/session/${s.id}`} className="text-amber-300 hover:underline">Open →</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold text-zinc-100">Published listings</h2>
        {listings.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-500">Nothing published yet.</p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-xl border border-white/8">
            <table className="w-full text-sm">
              <thead className="bg-white/[0.03] text-left text-xs uppercase tracking-wider text-zinc-500">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Listing</th>
                  <th className="px-4 py-2.5 font-medium">Seller</th>
                  <th className="px-4 py-2.5 font-medium">Price</th>
                  <th className="px-4 py-2.5 font-medium">Checks</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/6">
                {listings.map((l) => {
                  const checks = db.verifications.filter((v) => v.listingId === l.id);
                  const bad = checks.some((v) => !v.match);
                  return (
                    <tr key={l.id} className="hover:bg-white/[0.02]">
                      <td className="px-4 py-3">
                        <Link href={`/listing/${l.id}`} className="text-zinc-200 hover:text-white">{l.title}</Link>
                        <div className="font-mono text-xs text-zinc-600">{l.id}</div>
                      </td>
                      <td className="px-4 py-3 text-zinc-400">{l.seller}</td>
                      <td className="px-4 py-3 text-zinc-200">{money(l.price, l.currency)}</td>
                      <td className={`px-4 py-3 ${bad ? "text-red-400" : checks.length ? "text-emerald-300" : "text-zinc-600"}`}>
                        {checks.length ? `${checks.length} (${bad ? "mismatch!" : "all match"})` : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className={l.status === "sold" ? "text-zinc-500" : "text-emerald-300"}>{l.status === "sold" ? "Sold" : "For sale"}</span>
                          <ListingStatusButton id={l.id} status={l.status} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
