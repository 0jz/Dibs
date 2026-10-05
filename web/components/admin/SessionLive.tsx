"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Grade, Listing, ListingKind, Session } from "@/lib/types";
import { GRADE_INFO, shortHash, suggestTitle, tempTone } from "@/lib/format";
import { ResultStats, SpecList, TelemetryPanel } from "@/components/ReportView";
import { CopyCommand } from "@/components/CopyCommand";

const STEPS = [
  { key: "waiting", label: "Waiting for device" },
  { key: "identity", label: "Hardware read" },
  { key: "cpu", label: "CPU test" },
  { key: "gpu", label: "GPU stress" },
  { key: "done", label: "Review" },
  { key: "published", label: "Published" },
];

function stepIndex(s: Session) {
  if (s.status === "published") return 5;
  if (s.status === "done") return 4;
  if (s.phase === "memory" || s.phase === "cooldown") return 3;
  const i = STEPS.findIndex((x) => x.key === s.phase);
  return i === -1 ? 1 : i;
}

export function SessionLive({ initial, servers }: { initial: Session; servers: string[] }) {
  const router = useRouter();
  const [session, setSession] = useState(initial);
  const [server, setServer] = useState(servers[servers.length > 1 ? 1 : 0]);

  // Poll while the agent is still sending data (and briefly after, for the late GPU score).
  const live = session.status === "waiting" || session.status === "testing" || (session.status === "done" && !session.gpuScore);
  useEffect(() => {
    if (!live) return;
    const timer = setInterval(async () => {
      const res = await fetch(`/api/sessions/${session.id}`, { cache: "no-store" });
      if (res.ok) setSession(await res.json());
    }, 1500);
    return () => clearInterval(timer);
  }, [live, session.id]);

  const step = stepIndex(session);
  const last = session.samples[session.samples.length - 1];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/admin" className="text-sm text-zinc-500 hover:text-zinc-300">← Dashboard</Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white">
            Test session <span className="font-mono text-amber-300">{session.code}</span>
          </h1>
        </div>
        {session.status !== "published" && (
          <button
            onClick={async () => {
              if (!confirm("Cancel this test session?")) return;
              await fetch(`/api/sessions/${session.id}`, { method: "DELETE" });
              router.push("/admin");
            }}
            className="rounded-lg border border-white/10 px-3 py-2 text-sm text-zinc-400 hover:border-red-400/40 hover:text-red-300"
          >
            Cancel session
          </button>
        )}
      </div>

      {/* Stepper */}
      <ol className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {STEPS.map((s, i) => (
          <li
            key={s.key}
            className={`rounded-lg border px-3 py-2 text-xs ${
              i < step
                ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
                : i === step
                  ? "border-amber-300/50 bg-amber-300/10 text-amber-200"
                  : "border-white/8 text-zinc-600"
            }`}
          >
            <span className="mr-1">{i < step ? "✓" : i === step && live ? "●" : `${i + 1}.`}</span>
            {s.label}
          </li>
        ))}
      </ol>

      {session.status === "waiting" && (
        <div className="rounded-2xl border border-amber-300/20 bg-amber-300/[0.04] p-6">
          <div className="text-sm uppercase tracking-wider text-amber-300/80">Run on the customer&apos;s device</div>
          <div className="mt-2 font-mono text-6xl font-semibold tracking-[0.15em] text-white">{session.code}</div>
          <ol className="mt-6 space-y-4 text-sm text-zinc-300">
            <li>
              <span className="text-zinc-500">1.</span> Download the agent on the device:{" "}
              <a href={`${server}/dibs_agent.py`} className="text-amber-300 hover:underline">{server}/dibs_agent.py</a>
            </li>
            <li>
              <span className="text-zinc-500">2.</span> Run it (takes ~1 minute, a GPU stress window will open):
              <div className="mt-2 max-w-3xl">
                <CopyCommand command={`python dibs_agent.py test --server ${server} --code ${session.code}`} />
              </div>
            </li>
            <li>
              <span className="text-zinc-500">3.</span> Phone (open on the phone, same Wi-Fi). Stress is capped at 20s, endurance at 25s:
              <div className="mt-2 flex flex-wrap gap-3 text-amber-300">
                <a className="hover:underline" href={`${server}/stress?profile=phone&mode=core&seconds=20&code=${session.code}`}>Stress</a>
                <a className="hover:underline" href={`${server}/stress?profile=phone&mode=memory&seconds=25&code=${session.code}`}>Endurance</a>
              </div>
            </li>
          </ol>
          {(session.gpuScore || session.memoryScore) && (
            <p className="mt-4 text-sm text-zinc-300">
              {session.gpuScore ? `Stress ${session.gpuScore.fps} fps` : "Stress not in yet"}
              {session.memoryScore ? ` · endurance ${session.memoryScore.fps} fps` : ""}
              {session.memoryScore?.batteryEndPct != null ? ` · battery ${session.memoryScore.batteryStartPct}% → ${session.memoryScore.batteryEndPct}%` : ""}
            </p>
          )}
          {servers.length > 1 && (
            <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
              Server address:
              {servers.map((s) => (
                <button
                  key={s}
                  onClick={() => setServer(s)}
                  className={`rounded-md border px-2 py-1 font-mono ${s === server ? "border-amber-300/50 text-amber-200" : "border-white/10 text-zinc-400 hover:border-white/25"}`}
                >
                  {s.replace("http://", "")}
                </button>
              ))}
              <span>(use a LAN address when testing a different PC)</span>
            </div>
          )}
        </div>
      )}

      {session.identity && (
        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <div className="min-w-0 space-y-6">
            <section>
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-zinc-100">Live telemetry</h2>
                {last && live && (
                  <div className="flex gap-4 text-sm tabular-nums">
                    <span className={tempTone(last.gpuTemp)}>{last.gpuTemp ?? "—"}°C</span>
                    <span className="text-sky-300">{last.gpuUtil ?? "—"}% load</span>
                    <span className="text-zinc-400">{last.gpuPower ?? "—"} W</span>
                  </div>
                )}
              </div>
              <div className="mt-3">
                <TelemetryPanel samples={session.samples} />
              </div>
            </section>

            {session.results && (
              <section>
                <h2 className="font-semibold text-zinc-100">Results</h2>
                <div className="mt-3">
                  <ResultStats identity={session.identity} results={session.results} gpuScore={session.gpuScore} memoryScore={session.memoryScore} />
                </div>
                {session.gpuScore && <RendererNote renderer={session.gpuScore.renderer} gpus={session.identity.gpus.map((g) => g.name)} />}
              </section>
            )}

            <section>
              <h2 className="font-semibold text-zinc-100">Detected hardware</h2>
              <div className="mt-3 rounded-xl border border-white/8 bg-white/[0.02] px-4">
                <SpecList identity={session.identity} />
              </div>
              <p className="mt-2 font-mono text-xs text-zinc-500" title={session.deviceHash ?? ""}>
                Device fingerprint {shortHash(session.deviceHash, 10)}
              </p>
              {session.identity.gpus.map((g, i) => (
                <p key={g.uuid} className="font-mono text-xs text-zinc-500" title={session.partHashes?.[i] ?? ""}>
                  GPU fingerprint ({g.name.replace(/^NVIDIA GeForce /, "")}) {shortHash(session.partHashes?.[i], 10)}
                </p>
              ))}
            </section>
          </div>

          <aside className="lg:sticky lg:top-6 lg:self-start">
            {session.status === "published" && session.listingId ? (
              <div className="rounded-2xl border border-emerald-400/30 bg-emerald-400/[0.06] p-5">
                <div className="font-semibold text-emerald-300">✓ Published</div>
                <p className="mt-1 text-sm text-zinc-400">The listing is live with the signed test report.</p>
                <Link href={`/listing/${session.listingId}`} className="mt-4 inline-block rounded-lg bg-emerald-400 px-4 py-2 text-sm font-medium text-black hover:bg-emerald-300">
                  View listing →
                </Link>
              </div>
            ) : session.status === "done" ? (
              <PublishForm session={session} onPublished={(l) => setSession({ ...session, status: "published", listingId: l.id })} />
            ) : (
              <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-5 text-sm text-zinc-400">
                <div className="font-semibold text-zinc-200">Test running…</div>
                <p className="mt-1">The review form unlocks when the agent finishes. Keep the stress window in front on the device.</p>
              </div>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}

/** Which GPU the browser rendered the stress test on. Privacy browsers (Brave, Firefox RFP) report a fake name. */
function RendererNote({ renderer, gpus }: { renderer: string; gpus: string[] }) {
  const matched = gpus.some((g) => renderer.includes(g.replace(/^NVIDIA /, "").replace(/ Laptop GPU$/, "")));
  if (matched) return <p className="mt-2 text-xs text-emerald-300/80">✓ GPU stress ran on the dedicated GPU</p>;
  if (/or similar/i.test(renderer))
    return <p className="mt-2 text-xs text-zinc-500">Browser masks the GPU name — check the load graph above to confirm the dedicated GPU was used.</p>;
  return <p className="mt-2 text-xs text-amber-300/90">⚠ Stress ran on “{renderer}”. If this is the integrated GPU, set the browser to High performance in Windows Graphics settings and re-test.</p>;
}

function PublishForm({ session, onPublished }: { session: Session; onPublished: (l: Listing) => void }) {
  const identity = session.identity!;
  const canSellPart = identity.gpus.length > 0 && (session.partHashes?.length ?? 0) > 0;
  // A desktop on the bench is usually the shop's test rig with a customer's card in it; a laptop is sold whole.
  const defaultKind: ListingKind = canSellPart && identity.deviceType === "desktop" ? "part" : "device";
  const [form, setForm] = useState({
    kind: defaultKind,
    gpuIndex: 0,
    title: suggestTitle(identity, defaultKind),
    grade: "A" as Grade,
    seller: "",
    price: "",
    currency: "EUR" as Listing["currency"],
    sealId: "",
    notes: "",
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm({ ...form, [k]: e.target.value });

  async function publish(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch(`/api/sessions/${session.id}/publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, price: Number(form.price) }),
    });
    setBusy(false);
    const body = await res.json();
    if (res.ok) onPublished(body);
    else setError(body.error ?? "Publish failed");
  }

  const input = "mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-amber-300/50";

  return (
    <form onSubmit={publish} className="space-y-4 rounded-2xl border border-amber-300/25 bg-[#111013] p-5">
      <div>
        <div className="font-semibold text-zinc-100">Review & publish</div>
        <p className="mt-0.5 text-xs text-zinc-500">Your shop signs this report. Measurements can&apos;t be edited.</p>
      </div>
      <div>
        <div className="text-xs text-zinc-400">What is being sold</div>
        <div className="mt-1 grid grid-cols-2 gap-2">
          {([
            ["part", "Graphics card only"],
            ["device", "Whole device"],
          ] as [ListingKind, string][]).map(([k, label]) => (
            <button
              type="button"
              key={k}
              disabled={k === "part" && !canSellPart}
              onClick={() => setForm({ ...form, kind: k, title: suggestTitle(identity, k, form.gpuIndex) })}
              className={`rounded-lg border py-2 text-sm disabled:cursor-not-allowed disabled:opacity-40 ${form.kind === k ? "border-amber-300/50 bg-amber-300/10 text-amber-200" : "border-white/10 text-zinc-400 hover:border-white/25"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="mt-1 text-xs text-zinc-500">
          {form.kind === "part"
            ? "Verified by the card's own ID + firmware, so it matches in the buyer's PC."
            : "Verified by BIOS serial + GPUs: the buyer must receive this exact machine."}
        </p>
        {form.kind === "part" && identity.gpus.length > 1 && (
          <select
            className={input}
            value={form.gpuIndex}
            onChange={(e) => {
              const gpuIndex = Number(e.target.value);
              setForm({ ...form, gpuIndex, title: suggestTitle(identity, "part", gpuIndex) });
            }}
          >
            {identity.gpus.map((g, i) => (
              <option key={g.uuid} value={i}>{g.name}</option>
            ))}
          </select>
        )}
      </div>
      <label className="block text-xs text-zinc-400">
        Listing title
        <input className={input} value={form.title} onChange={set("title")} required />
      </label>
      <div>
        <div className="text-xs text-zinc-400">Condition grade</div>
        <div className="mt-1 grid grid-cols-3 gap-2">
          {(["A", "B", "C"] as Grade[]).map((g) => (
            <button
              type="button"
              key={g}
              onClick={() => setForm({ ...form, grade: g })}
              className={`rounded-lg border py-2 text-sm ${form.grade === g ? GRADE_INFO[g].tone : "border-white/10 text-zinc-400 hover:border-white/25"}`}
            >
              {g} · {GRADE_INFO[g].label}
            </button>
          ))}
        </div>
      </div>
      <label className="block text-xs text-zinc-400">
        Seller name
        <input className={input} value={form.seller} onChange={set("seller")} placeholder="e.g. Marko P." required />
      </label>
      <div className="grid grid-cols-[1fr_100px] gap-2">
        <label className="block text-xs text-zinc-400">
          Price
          <input className={input} type="number" min="1" step="any" value={form.price} onChange={set("price")} required />
        </label>
        <label className="block text-xs text-zinc-400">
          Currency
          <select className={input} value={form.currency} onChange={set("currency")}>
            <option>EUR</option>
            <option>USDC</option>
            <option>MON</option>
          </select>
        </label>
      </div>
      <label className="block text-xs text-zinc-400">
        Seal sticker ID
        <input className={input} value={form.sealId} onChange={set("sealId")} placeholder="e.g. TZ-004211" />
      </label>
      <label className="block text-xs text-zinc-400">
        Technician notes
        <textarea className={input} rows={3} value={form.notes} onChange={set("notes")} placeholder="Repasted, minor scratch on lid, fans clean…" />
      </label>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button disabled={busy} className="w-full rounded-lg bg-amber-400 py-2.5 font-medium text-black hover:bg-amber-300 disabled:opacity-60">
        {busy ? "Publishing…" : "Sign & publish listing"}
      </button>
    </form>
  );
}
