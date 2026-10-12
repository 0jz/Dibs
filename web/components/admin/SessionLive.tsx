"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Grade, Listing, ListingKind, SaleScope, Session, StressTierId } from "@/lib/types";
import { GRADE_INFO, SCOPE_INFO, shortHash, suggestTitle, tempTone } from "@/lib/format";
import { suggestGrade } from "@/lib/grade";
import { soldReferencePct, type PartRow } from "@/lib/partScore";
import { ResultStats, SpecList, TelemetryPanel } from "@/components/ReportView";
import { CopyCommand } from "@/components/CopyCommand";
import { STRESS_TIERS } from "@/lib/tests";

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

export function SessionLive({ initial, partRows: initialRows, servers }: { initial: Session; partRows: PartRow[]; servers: string[] }) {
  const router = useRouter();
  const [session, setSession] = useState(initial);
  const [partRows, setPartRows] = useState(initialRows);
  const [server, setServer] = useState(servers[0]);

  // Poll while the agent is still sending data (and briefly after, for the late GPU score).
  const live = session.status === "waiting" || session.status === "testing" || (session.status === "done" && !session.gpuScore && !session.results?.checks?.loadSkipped);
  useEffect(() => {
    if (!live) return;
    const timer = setInterval(async () => {
      const res = await fetch(`/api/sessions/${session.id}`, { cache: "no-store" });
      if (!res.ok) return;
      const body = await res.json();
      const { partRows: nextRows, ...next } = body;
      setSession(next);
      if (Array.isArray(nextRows)) setPartRows(nextRows);
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
          <TierPicker session={session} onChange={setSession} />
          <ScopePicker session={session} onChange={setSession} />
          <HashrateToggle session={session} onChange={setSession} />
          <p className="mt-4 text-sm text-zinc-500">This code works once. A second run, including a different tier, needs a new test.</p>
          <ol className="mt-6 space-y-4 text-sm text-zinc-300">
            <li>
              <span className="text-zinc-500">1.</span> Download the agent on the device:{" "}
              <a href={`${server}/dibs_agent.py`} download className="text-amber-300 hover:underline">{server}/dibs_agent.py</a>
            </li>
            <li>
              <span className="text-zinc-500">2.</span> Run it. A laptop stays on Light unless you pick a longer tier, and that longer tier needs the charger.
              <div className="mt-2 max-w-3xl">
                <CopyCommand command={`python dibs_agent.py test --server ${server} --code ${session.code}${session.stressTier ? ` --tier ${session.stressTier}` : ""}`} />
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
              <span>On another network, keep the https address. A 192.168 address only works on this Wi-Fi.</span>
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
                  <ResultStats identity={session.identity} results={session.results} gpuScore={session.gpuScore} memoryScore={session.memoryScore} saleScope={session.saleScope} partRows={partRows} />
                </div>
              </section>
            )}

            <section>
              <h2 className="font-semibold text-zinc-100">Detected hardware</h2>
              <div className="mt-3 rounded-xl border border-white/8 bg-white/[0.02] px-4">
                <SpecList identity={session.identity} saleScope={session.saleScope} />
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
              <PublishForm session={session} partRows={partRows} onPublished={(l) => setSession({ ...session, status: "published", listingId: l.id })} />
            ) : (
              <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-5 text-sm text-zinc-400">
                <div className="font-semibold text-zinc-200">Test running…</div>
                <p className="mt-1">The review form unlocks when the agent finishes. Keep the stress window in front on the device, or press Stop on it.</p>
                {session.stressTier && (
                  <p className="mt-2 text-zinc-300">
                    {STRESS_TIERS[session.stressTier].label}. {STRESS_TIERS[session.stressTier].doesNotProve}
                  </p>
                )}
              </div>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}

const TIER_ORDER: StressTierId[] = ["light", "standard", "bench"];

function TierPicker({ session, onChange }: { session: Session; onChange: (s: Session) => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const chosen = session.stressTier ?? null;

  async function choose(tier: StressTierId | null) {
    setBusy(tier ?? "auto");
    const res = await fetch(`/api/sessions/${session.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stressTier: tier }),
    });
    setBusy(null);
    if (res.ok) onChange(await res.json());
  }

  return (
    <div className="mt-6">
      <div className="text-sm text-zinc-400">Stress tier</div>
      <p className="mt-1 text-sm text-zinc-500">
        Leave it on Auto and a laptop runs Light, a desktop runs Standard. Light is the weaker check a customer can ask for. It is not a certification. Standard and Bench on a laptop need the charger.
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-4">
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => choose(null)}
          className={`rounded-lg border px-3 py-2 text-left text-sm ${chosen === null ? "border-amber-300/50 bg-amber-300/10 text-amber-200" : "border-white/10 text-zinc-400 hover:border-white/25"}`}
        >
          <div className="font-medium">Auto</div>
          <div className="mt-0.5 text-xs opacity-80">Laptop Light, desktop Standard</div>
        </button>
        {TIER_ORDER.map((id) => {
          const tier = STRESS_TIERS[id];
          return (
            <button
              type="button"
              key={id}
              disabled={busy !== null}
              onClick={() => choose(id)}
              className={`rounded-lg border px-3 py-2 text-left text-sm ${chosen === id ? "border-amber-300/50 bg-amber-300/10 text-amber-200" : "border-white/10 text-zinc-400 hover:border-white/25"}`}
            >
              <div className="font-medium">{tier.label}</div>
              <div className="mt-0.5 text-xs opacity-80">
                {tier.coreS}s core{tier.memoryS ? ` + ${tier.memoryS}s VRAM` : ""}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

const SCOPES: SaleScope[] = ["device", "gpu", "cpu", "ram", "storage", "battery"];

function ScopePicker({ session, onChange }: { session: Session; onChange: (s: Session) => void }) {
  const [busy, setBusy] = useState(false);
  const chosen = session.saleScope ?? "device";

  async function choose(saleScope: SaleScope) {
    setBusy(true);
    const res = await fetch(`/api/sessions/${session.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ saleScope }),
    });
    setBusy(false);
    if (res.ok) onChange(await res.json());
  }

  return (
    <div className="mt-6">
      <div className="text-sm text-zinc-400">What is being sold</div>
      <p className="mt-1 text-sm text-zinc-500">
        Pick this before copying the command. The agent still reads the whole machine. The listing fingerprint follows only this choice.
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {SCOPES.map((id) => (
          <button
            type="button"
            key={id}
            disabled={busy}
            onClick={() => choose(id)}
            className={`rounded-lg border px-3 py-2 text-left text-sm ${chosen === id ? "border-amber-300/50 bg-amber-300/10 text-amber-200" : "border-white/10 text-zinc-400 hover:border-white/25"}`}
          >
            {SCOPE_INFO[id].label}
          </button>
        ))}
      </div>
      {SCOPE_INFO[chosen].weaker && (
        <p className="mt-2 text-xs text-amber-200">This id is weaker than a GPU UUID. Windows can hide it or reuse it.</p>
      )}
    </div>
  );
}

function HashrateToggle({ session, onChange }: { session: Session; onChange: (s: Session) => void }) {
  const allowed = session.stressTier === "standard" || session.stressTier === "bench";
  const [busy, setBusy] = useState(false);

  async function choose(hashrate: boolean) {
    setBusy(true);
    const res = await fetch(`/api/sessions/${session.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hashrate }),
    });
    setBusy(false);
    if (res.ok) onChange(await res.json());
  }

  return (
    <div className="mt-6">
      <div className="text-sm text-zinc-400">Hashrate check</div>
      <p className="mt-1 text-sm text-zinc-500">
        Optional, and only on Standard or Bench when a GPU is present. It is a short offline sample. It does not join a pool. If no local benchmark is installed, the report says the check was not run.
      </p>
      <button
        type="button"
        disabled={!allowed || busy}
        onClick={() => choose(!session.hashrate)}
        className={`mt-3 rounded-lg border px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-40 ${session.hashrate ? "border-amber-300/50 bg-amber-300/10 text-amber-200" : "border-white/10 text-zinc-400"}`}
      >
        {session.hashrate ? "On" : "Off"}
      </button>
    </div>
  );
}

function PublishForm({ session, partRows, onPublished }: { session: Session; partRows: PartRow[]; onPublished: (l: Listing) => void }) {
  const identity = session.identity!;
  const canSellPart = identity.gpus.length > 0 && (session.partHashes?.length ?? 0) > 0;
  // A desktop on the bench is usually the shop's test rig with a customer's card in it; a laptop is sold whole.
  const defaultKind: ListingKind = canSellPart && identity.deviceType === "desktop" ? "part" : "device";
  const lockedScope = session.saleScope;
  const initialScope: SaleScope = lockedScope ?? (defaultKind === "part" ? "gpu" : "device");
  const tier = session.results?.checks?.stressTier ?? session.stressTier;
  const suggestion = suggestGrade({
    identity,
    results: session.results,
    saleScope: initialScope,
    stressTier: tier,
    referencePct: soldReferencePct(partRows, initialScope, 0),
    partIndex: 0,
  });
  const [form, setForm] = useState({
    kind: defaultKind,
    partIndex: 0,
    title: suggestTitle(identity, initialScope, 0),
    grade: suggestion.grade,
    seller: "",
    price: "",
    currency: "SOL" as Listing["currency"],
    sellerWallet: "",
    sealId: "",
    notes: "",
  });
  const activeScope: SaleScope = lockedScope ?? (form.kind === "part" ? "gpu" : "device");
  const shown = suggestGrade({
    identity,
    results: session.results,
    saleScope: activeScope,
    stressTier: tier,
    referencePct: soldReferencePct(partRows, activeScope, form.partIndex),
    partIndex: form.partIndex,
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
        {(session.results?.checks?.stressTier ?? session.stressTier) === "light" && (
          <p className="mt-2 text-xs text-amber-200">Light check is not a certification. Bench is the tier that supports a grade.</p>
        )}
        {(session.results?.checks?.stressTier ?? session.stressTier) === "bench" && (
          <p className="mt-2 text-xs text-zinc-400">Bench is the tier that can support a grade. Burn-in was not run.</p>
        )}
      </div>
      <div>
        <div className="text-xs text-zinc-400">What is being sold</div>
        {lockedScope ? (
          <p className="mt-1 text-sm text-zinc-200">
            {SCOPE_INFO[lockedScope].label}. Fingerprint is {SCOPE_INFO[lockedScope].fingerprint}.
            {SCOPE_INFO[lockedScope].weaker && " This id is weaker than a GPU UUID."}
          </p>
        ) : (
          <>
            <div className="mt-1 grid grid-cols-2 gap-2">
              {([
                ["part", "Graphics card only"],
                ["device", "Whole device"],
              ] as [ListingKind, string][]).map(([k, label]) => (
                <button
                  type="button"
                  key={k}
                  disabled={k === "part" && !canSellPart}
                  onClick={() => setForm({ ...form, kind: k, title: suggestTitle(identity, k === "part" ? "gpu" : "device", form.partIndex) })}
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
          </>
        )}
        {((lockedScope ?? (form.kind === "part" ? "gpu" : "device")) === "gpu" && identity.gpus.length > 1) && (
          <select
            className={input}
            value={form.partIndex}
            onChange={(e) => {
              const partIndex = Number(e.target.value);
              setForm({ ...form, partIndex, title: suggestTitle(identity, "gpu", partIndex) });
            }}
          >
            {identity.gpus.map((g, i) => (
              <option key={g.uuid} value={i}>{g.name}</option>
            ))}
          </select>
        )}
        {lockedScope === "storage" && identity.disks.length > 1 && (
          <select
            className={input}
            value={form.partIndex}
            onChange={(e) => {
              const partIndex = Number(e.target.value);
              setForm({ ...form, partIndex, title: suggestTitle(identity, "storage", partIndex) });
            }}
          >
            {identity.disks.map((d, i) => (
              <option key={`${d.model}-${i}`} value={i}>{d.model}</option>
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
        <p className="mt-1 text-xs text-zinc-500">Suggested {shown.grade}. {shown.reasons.join(" ")} You can still pick another grade.</p>
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
          <input className={input} type="number" min="0.001" step="any" value={form.price} onChange={set("price")} required />
        </label>
        <label className="block text-xs text-zinc-400">
          Currency
          <select className={input} value={form.currency} onChange={set("currency")}>
            <option>EUR</option>
            <option>SOL</option>
            <option>USDC</option>
          </select>
        </label>
      </div>
      {(form.currency === "SOL" || form.currency === "USDC") && (
        <label className="block text-xs text-zinc-400">
          Seller Solana wallet
          <input className={input} value={form.sellerWallet} onChange={set("sellerWallet")} placeholder="Phantom address on devnet" required />
        </label>
      )}
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
