import type { GpuScore, Identity, ListingKind, Results, Sample } from "@/lib/types";
import { cleanName, tempTone } from "@/lib/format";
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

export function SpecList({ identity, kind = "device" }: { identity: Identity; kind?: ListingKind }) {
  if (kind === "part") {
    const g = identity.gpus[0];
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

export function ResultStats({
  identity,
  results,
  gpuScore,
  memoryScore = null,
  kind = "device",
}: {
  identity: Identity;
  results: Results;
  gpuScore: GpuScore | null;
  memoryScore?: GpuScore | null;
  kind?: ListingKind;
}) {
  const gpu = results.gpu;
  const disksOk = identity.disks.every((d) => d.health === "Healthy");
  // For a card sold on its own, the CPU, battery and storage belong to the shop's test bench, not the part.
  const whole = kind === "device";
  return (
    <>
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
      {whole && <Stat label="CPU multi-core" value={results.cpu.multiScore.toLocaleString("en-US")} hint={`single-core ${results.cpu.singleScore.toLocaleString("en-US")}`} />}
      <Stat
        label="GPU stress score"
        value={gpuScore ? `${gpuScore.fps} fps` : "—"}
        hint={gpuScore ? `${gpu?.durationS ?? "?"}s load${gpuScore.aborted ? " · stopped hot" : ""}` : "not run"}
      />
      {memoryScore && (
        <Stat
          label={memoryScore.profile === "phone" ? "Phone endurance" : "VRAM bandwidth"}
          value={`${memoryScore.fps} fps`}
          hint={
            memoryScore.batteryStartPct != null && memoryScore.batteryEndPct != null
              ? `battery ${memoryScore.batteryStartPct}% → ${memoryScore.batteryEndPct}%`
              : "short bandwidth pass, no miner"
          }
        />
      )}
      <Stat label="GPU peak temp" value={gpu ? `${gpu.maxTemp}°C` : "—"} tone={tempTone(gpu?.maxTemp)} hint={gpu ? `avg ${gpu.avgTemp}°C under load` : undefined} />
      <Stat
        label="Thermal throttling"
        value={gpu ? (gpu.throttleSamples ? "Detected" : "None") : "—"}
        tone={gpu ? (gpu.throttleSamples ? "text-red-400" : "text-emerald-300") : undefined}
        hint={gpu?.maxPowerW ? `peak ${gpu.maxPowerW} W · ${gpu.maxClockMhz} MHz` : undefined}
      />
      {whole && identity.battery && (
        <Stat
          label="Battery health"
          value={`${identity.battery.healthPct}%`}
          tone={identity.battery.healthPct >= 85 ? "text-emerald-300" : identity.battery.healthPct >= 70 ? "text-amber-300" : "text-red-400"}
          hint={`${identity.battery.cycles} cycles · ${(identity.battery.fullMwh / 1000).toFixed(1)} of ${(identity.battery.designMwh / 1000).toFixed(1)} Wh`}
        />
      )}
      {whole && (
        <Stat
          label="Storage health"
          value={disksOk ? "Healthy" : "Warning"}
          tone={disksOk ? "text-emerald-300" : "text-red-400"}
          hint={`${identity.disks.length} drive${identity.disks.length === 1 ? "" : "s"} · SMART status`}
        />
      )}
    </div>
    {identity.gpus[0] && <ReferenceMatch name={identity.gpus[0].name} kind="gpu" />}
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
