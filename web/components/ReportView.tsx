import type { PerfVerdict } from "@/lib/performance";
import type { GpuScore, Identity, ListingKind, Results, SaleScope, Sample } from "@/lib/types";
import { SCOPE_INFO, cleanName, tempTone } from "@/lib/format";
import { BURN_IN_NOTE, STRESS_TIERS } from "@/lib/tests";
import { groupPartRows, type PartRow } from "@/lib/partScore";
import { TelemetryChart } from "./TelemetryChart";
import { ReferenceMatch } from "./ReferenceMatch";

function Stat({ label, value, hint, tone }: { label: string; value: React.ReactNode; hint?: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-white/8 bg-white/[0.03] p-4">
      <div className="text-xs uppercase tracking-wider text-zinc-500">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${tone ?? "text-zinc-100"}`}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-zinc-500">{hint}</div>}
    </div>
  );
}

export function SpecList({
  identity,
  kind = "device",
  saleScope,
}: {
  identity: Identity;
  kind?: ListingKind;
  saleScope?: SaleScope;
}) {
  const scope = saleScope ?? (kind === "part" ? "gpu" : "device");
  const weaker = SCOPE_INFO[scope].weaker ? "This id is weaker than a GPU UUID." : "";
  if (scope === "gpu") {
    const g = identity.gpus[0];
    if (!g) return <Rows rows={[["GPU", "No graphics card was recorded"]]} />;
    return (
      <Rows
        rows={[
          ["GPU", g.name],
          ["VRAM", `${Math.round(g.vramMb / 1024)} GB`],
          ["VBIOS", g.vbios],
          ["Max clock", `${g.maxClockMhz} MHz`],
          ["Test bench", `${identity.system.manufacturer} ${identity.system.model} · ${cleanName(identity.cpu.name)} · driver ${g.driver}`],
        ]}
      />
    );
  }
  if (scope === "cpu") {
    return (
      <Rows
        rows={[
          ["CPU", `${cleanName(identity.cpu.name)} · ${identity.cpu.cores} cores / ${identity.cpu.threads} threads`],
          ["Identity", weaker],
          ["Test bench", `${identity.system.manufacturer} ${identity.system.model}`],
        ]}
      />
    );
  }
  if (scope === "ram") {
    return (
      <Rows
        rows={[
          [
            "Memory",
            `${identity.ram.totalGb} GB · ${identity.ram.modules
              .map((m) => `${m.capacityGb} GB ${m.manufacturer} ${m.part}`)
              .join(" + ")}`,
          ],
          ["Identity", weaker],
        ]}
      />
    );
  }
  if (scope === "storage") {
    const d = identity.disks[0];
    return (
      <Rows
        rows={[
          ["Storage", d ? `${d.model} · ${d.sizeGb} GB ${d.type}` : "No drive was recorded"],
          ["Health", d?.health || "—"],
          ["Identity", weaker],
        ]}
      />
    );
  }
  if (scope === "battery") {
    const b = identity.battery;
    return (
      <Rows
        rows={[
          ["Battery", b ? `${b.healthPct}% · ${b.cycles} cycles` : "No battery was recorded"],
          ["Identity", weaker],
        ]}
      />
    );
  }
  const rows: [string, string][] = [
    ["Device", `${identity.system.manufacturer} ${identity.system.model}`],
    ["CPU", `${cleanName(identity.cpu.name)} · ${identity.cpu.cores} cores / ${identity.cpu.threads} threads`],
    ...identity.gpus.map((g, i): [string, string] => [
      identity.gpus.length > 1 ? `GPU ${i + 1}` : "GPU",
      `${g.name} · ${Math.round(g.vramMb / 1024)} GB · VBIOS ${g.vbios}`,
    ]),
    [
      "Memory",
      `${identity.ram.totalGb} GB · ${identity.ram.modules
        .map((m) => `${m.capacityGb} GB ${m.manufacturer} ${m.speedMts} MT/s`)
        .join(" + ")}`,
    ],
    ...identity.disks.map((d): [string, string] => ["Storage", `${d.model} · ${d.sizeGb} GB ${d.type}`]),
    ["OS", identity.os],
  ];
  return <Rows rows={rows} />;
}

function Rows({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="divide-y divide-white/6 text-sm">
      {rows.map(([k, v], i) => (
        <div key={i} className="grid grid-cols-[110px_1fr] gap-3 py-2.5">
          <dt className="text-zinc-500">{k}</dt>
          <dd className="text-zinc-200">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Which GPU the browser rendered on. Privacy browsers report a fake name. */
export function RendererNote({ renderer, gpus }: { renderer: string; gpus: string[] }) {
  const matched = gpus.some((g) => renderer.includes(g.replace(/^NVIDIA /, "").replace(/ Laptop GPU$/, "")));
  if (matched) return <p className="mt-2 text-xs text-emerald-300/80">GPU stress ran on the dedicated GPU ({renderer}).</p>;
  if (/or similar/i.test(renderer))
    return <p className="mt-2 text-xs text-zinc-500">Browser masks the GPU name. The load graph shows whether the dedicated GPU did the work.</p>;
  return <p className="mt-2 text-xs text-amber-300/90">Stress ran on “{renderer}”. If that is the integrated GPU, the NVIDIA temperature never moved. Set the browser to High performance in Windows Graphics settings and re-test.</p>;
}

export function StressTierNote({
  results,
  gpuScore,
  identity,
}: {
  results: Results;
  gpuScore: GpuScore | null;
  identity: Identity;
}) {
  const checks = results.checks;
  const tier = checks?.stressTier ? STRESS_TIERS[checks.stressTier] : undefined;
  const reached = results.gpu?.maxTemp ?? checks?.abortTempC;
  const limits = checks?.limits;
  const blender = checks?.blender;
  return (
    <div className="mb-4 rounded-xl border border-white/8 bg-white/[0.02] px-4 py-3 text-sm leading-relaxed text-zinc-300">
      {tier ? (
        <>
          <div className="font-medium text-zinc-100">{tier.label}</div>
          <p className="mt-1">{tier.summary} {tier.doesNotProve}</p>
        </>
      ) : (
        <p>Stress tier was not recorded on this run.</p>
      )}
      {limits && (
        <p className="mt-1 text-zinc-400">
          Stop at {limits.abortTempC}°C ({limits.source}
          {limits.slowdownTempC != null ? ` · driver slowdown ${limits.slowdownTempC}°C` : ""}
          {limits.powerLimitW != null ? ` · power limit ${limits.powerLimitW} W` : ""}).
        </p>
      )}
      {blender && (
        <p className="mt-1 text-zinc-400">
          Junkshop Blender {blender.pinnedVersion}
          {blender.cpu?.ran && blender.cpu.samplesPerMin != null ? ` · CPU ${Math.round(blender.cpu.samplesPerMin)}/min` : blender.cpu?.note ? ` · CPU: ${blender.cpu.note}` : ""}
          {blender.gpu?.ran && blender.gpu.samplesPerMin != null ? ` · CUDA ${Math.round(blender.gpu.samplesPerMin)}/min` : blender.gpu?.note ? ` · CUDA: ${blender.gpu.note}` : ""}
        </p>
      )}
      {checks?.abortedHot && reached != null && (
        <p className="mt-1 text-amber-200">Stopped early, GPU reached {reached}°C.</p>
      )}
      {checks?.loadSkipped && <p className="mt-1 text-amber-200">{checks.loadSkipped}</p>}
      <p className="mt-1 text-zinc-500">{BURN_IN_NOTE}</p>
      {gpuScore?.renderer && <RendererNote renderer={gpuScore.renderer} gpus={identity.gpus.map((g) => g.name)} />}
    </div>
  );
}

const VERDICT_TONE: Record<PerfVerdict, string> = {
  above: "text-sky-300",
  normal: "text-emerald-300",
  low: "text-amber-300",
  below: "text-red-400",
};

const VERDICT_LABEL: Record<PerfVerdict, string> = {
  above: "Above normal range",
  normal: "Normal",
  low: "Slightly low",
  below: "Below normal range",
};

function PartCard({ row }: { row: PartRow }) {
  return (
    <div className="rounded-xl border border-white/8 bg-white/[0.03] p-4">
      <div className="text-xs uppercase tracking-wider text-zinc-500">{row.label}</div>
      {row.name && row.name !== row.value && <div className="mt-1 text-sm text-zinc-300">{row.name}</div>}
      <div className={`mt-2 text-2xl font-semibold tabular-nums ${row.tone ?? "text-zinc-100"}`}>{row.value}</div>
      {row.hint && <div className="mt-0.5 text-xs text-zinc-500">{row.hint}</div>}
      {row.referencePct != null && (
        <div className={`mt-2 text-sm font-medium tabular-nums ${VERDICT_TONE[row.referenceVerdict ?? "normal"]}`}>
          {row.referencePct}% of junkshop median
          {row.referenceVerdict && row.referenceVerdict !== "normal" && (
            <span className="ml-2 rounded-full border border-current px-2 py-0.5 text-xs font-normal">
              {VERDICT_LABEL[row.referenceVerdict]}
            </span>
          )}
        </div>
      )}
      {row.referenceNote && <div className="mt-0.5 text-xs text-zinc-500">{row.referenceNote}</div>}
    </div>
  );
}

function PartGroup({
  title,
  note,
  rows,
  identity,
  scope,
}: {
  title?: string;
  note?: string;
  rows: PartRow[];
  identity: Identity;
  scope: SaleScope;
}) {
  if (!rows.length) return null;
  const gpu = rows.find((row) => row.kind === "gpu");
  const gpuName = gpu ? identity.gpus.find((card) => card.name === gpu.name)?.name : undefined;
  return (
    <section className={title ? "mt-6" : undefined}>
      {title && <h3 className="text-sm font-medium text-zinc-200">{title}</h3>}
      {note && <p className="mt-1 text-xs leading-relaxed text-zinc-500">{note}</p>}
      <div className={`grid grid-cols-2 gap-3 lg:grid-cols-3 ${title || note ? "mt-3" : ""}`}>
        {rows.map((row) => (
          <PartCard key={row.id} row={row} />
        ))}
      </div>
      {gpuName && <ReferenceMatch name={gpuName} kind="gpu" />}
      {scope === "cpu" && rows.some((row) => row.kind === "cpu") && <ReferenceMatch name={identity.cpu.name} kind="cpu" />}
    </section>
  );
}

export function ResultStats({
  identity,
  results,
  gpuScore,
  memoryScore = null,
  kind = "device",
  saleScope,
  partRows,
}: {
  identity: Identity;
  results: Results;
  gpuScore: GpuScore | null;
  memoryScore?: GpuScore | null;
  kind?: ListingKind;
  saleScope?: SaleScope;
  partRows: PartRow[];
}) {
  const gpu = results.gpu;
  const scope = saleScope ?? (kind === "device" ? "device" : "gpu");
  const { product, bench } = groupPartRows(partRows, scope);
  const showGpuExtras = scope === "device" || scope === "gpu";
  const benchNote = scope === "gpu"
    ? "These parts were in the test machine. They are not part of this sale. A weak processor here can cap the graphics score."
    : "These parts were in the test machine. They are not part of this sale.";
  return (
    <>
    <StressTierNote results={results} gpuScore={gpuScore} identity={identity} />
    {scope !== "device" && product.length === 0 && (
      <p className="text-sm text-zinc-500">This part was not found in the test.</p>
    )}
    <PartGroup title={scope === "device" ? undefined : "Sold part"} rows={product} identity={identity} scope={scope} />
    {(showGpuExtras && (results.checks?.hashrate?.requested || results.mining || memoryScore?.profile === "phone")) && (
      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-3">
        {memoryScore?.profile === "phone" && (
          <Stat
            label="Phone endurance"
            value={`${memoryScore.fps} fps`}
            hint={
              memoryScore.batteryStartPct != null && memoryScore.batteryEndPct != null
                ? `battery ${memoryScore.batteryStartPct}% → ${memoryScore.batteryEndPct}%`
                : "short endurance pass"
            }
          />
        )}
        {results.checks?.hashrate?.requested && (
          <Stat
            label="Hashrate"
            value={results.checks.hashrate.ran && results.checks.hashrate.mhPerS != null ? `${results.checks.hashrate.mhPerS} MH/s` : "Not run"}
            hint={results.checks.hashrate.note}
          />
        )}
        {results.mining && (
          <Stat
            label="Mining endurance"
            value={`${results.mining.memoryGBps} GB/s`}
            hint={`simulated ${results.mining.durationS}s · plateau ${results.mining.maxTemp}°C · ${results.mining.avgPowerW} W`}
          />
        )}
      </div>
    )}
    {showGpuExtras && gpu?.maxPowerW != null && (
      <p className="mt-2 text-xs text-zinc-500">
        Peak {gpu.maxPowerW} W · {gpu.maxClockMhz ?? "—"} MHz · <span className={tempTone(gpu.maxTemp)}>{gpu.maxTemp}°C</span>
        {gpu.throttleSamples ? " · throttling detected" : " · no throttling"}
      </p>
    )}
    <PartGroup title="On this bench" note={benchNote} rows={bench} identity={identity} scope={scope} />
    </>
  );
}

export function TelemetryPanel({ samples }: { samples: Sample[] }) {
  return (
    <div className="rounded-xl border border-white/8 bg-white/[0.02] p-4">
      <TelemetryChart samples={samples} />
    </div>
  );
}
