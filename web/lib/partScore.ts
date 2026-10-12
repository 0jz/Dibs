import type { GpuScore, Identity, Listing, Results, SaleScope, Session, StressTierId } from "@/lib/types";
import { cleanName } from "@/lib/format";
import type { PerfVerdict, PerformanceHit } from "@/lib/performance";

export type PartKind = "cpu" | "gpu" | "ram" | "storage" | "battery";

export type PartRow = {
  id: string;
  kind: PartKind;
  label: string;
  name: string;
  value: string;
  hint: string;
  tone?: string;
  referencePct: number | null;
  referenceVerdict: PerfVerdict | null;
  referenceNote: string;
};

export type ScoreInput = {
  identity: Identity;
  results: Results;
  gpuScore: GpuScore | null;
  memoryScore?: GpuScore | null;
  stressTier?: StressTierId | null;
};

/** Optional Blender Open Data lookup. Server components pass scoreJunkshop results. */
export type PerformanceLookup = {
  cpu: PerformanceHit | null;
  gpu: (PerformanceHit | null)[];
};

const emptyPerf: PerformanceLookup = { cpu: null, gpu: [] };

export function stressTierOf(input: ScoreInput): StressTierId | null {
  return input.results.checks?.stressTier ?? input.stressTier ?? input.gpuScore?.tier ?? null;
}

export function buildPartRows(input: ScoreInput, perf: PerformanceLookup = emptyPerf): PartRow[] {
  const gpu = input.results.gpu;
  const blender = input.results.checks?.blender;
  const limits = input.results.checks?.limits;
  const stopped = Boolean(input.gpuScore?.aborted || input.results.checks?.abortedHot);
  const rows: PartRow[] = [];

  const cpuHit = perf.cpu;
  const cpuRun = blender?.cpu;
  const cpuValue =
    cpuRun?.ran && cpuRun.samplesPerMin != null
      ? `${Math.round(cpuRun.samplesPerMin).toLocaleString("en-US")}/min`
      : input.results.cpu.multiScore.toLocaleString("en-US");
  const cpuHint =
    cpuRun?.ran && cpuRun.samplesPerMin != null
      ? `junkshop samples/min · single-core ${input.results.cpu.singleScore.toLocaleString("en-US")}`
      : cpuRun && !cpuRun.ran
        ? cpuRun.note || "Blender Benchmark was not run, so there is no performance score."
        : `single-core ${input.results.cpu.singleScore.toLocaleString("en-US")}`;
  rows.push({
    id: "cpu",
    kind: "cpu",
    label: "CPU",
    name: cleanName(input.identity.cpu.name),
    value: cpuValue,
    hint: cpuHint,
    referencePct: cpuHit?.percent ?? null,
    referenceVerdict: cpuHit?.verdict ?? null,
    referenceNote: cpuHit
      ? cpuHit.note
      : cpuRun && !cpuRun.ran
        ? cpuRun.note
        : cpuRun?.ran
          ? "No reference for this model yet"
          : "",
  });

  const vram = input.memoryScore && input.memoryScore.profile !== "phone" ? `VRAM ${input.memoryScore.fps} fps` : "";
  input.identity.gpus.forEach((card, index) => {
    const gpuHit = perf.gpu[index] ?? perf.gpu[0] ?? null;
    const gpuRun = blender?.gpu;
    const heat = gpu
      ? [
          `peak ${gpu.maxTemp}°C`,
          gpu.throttleSamples ? "throttled" : "no throttle",
          limits?.powerLimitW != null ? `limit ${limits.powerLimitW} W` : "",
          vram,
          input.gpuScore && !gpuRun?.ran ? `${input.gpuScore.fps} fps heat` : "",
        ]
          .filter(Boolean)
          .join(" · ")
      : input.results.checks?.loadSkipped
        ? "not started"
        : "not run";
    const value =
      gpuRun?.ran && gpuRun.samplesPerMin != null
        ? `${Math.round(gpuRun.samplesPerMin).toLocaleString("en-US")}/min`
        : input.gpuScore
          ? `${input.gpuScore.fps} fps`
          : "—";
    let referenceNote = "";
    let referencePct: number | null = null;
    let referenceVerdict: PerfVerdict | null = null;
    if (stopped || gpuRun?.aborted) {
      referenceNote = "Stopped early, so this score is not compared to the reference.";
    } else if (gpuHit) {
      referencePct = gpuHit.percent;
      referenceVerdict = gpuHit.verdict;
      referenceNote = gpuHit.note;
    } else if (gpuRun && !gpuRun.ran) {
      referenceNote = gpuRun.note;
    } else if (gpuRun?.ran) {
      referenceNote = "No reference for this model yet";
    }
    rows.push({
      id: `gpu-${index}`,
      kind: "gpu",
      label: input.identity.gpus.length > 1 ? `GPU ${index + 1}` : "GPU",
      name: card.name,
      value,
      hint: heat,
      tone: gpu?.throttleSamples ? "text-red-400" : undefined,
      referencePct,
      referenceVerdict,
      referenceNote,
    });
  });

  const modules = input.identity.ram.modules
    .map((mod) => [mod.manufacturer, mod.part, mod.speedMts ? `${mod.speedMts} MT/s` : ""].filter(Boolean).join(" "))
    .join(" + ");
  rows.push({
    id: "ram",
    kind: "ram",
    label: "Memory",
    name: modules || `${input.identity.ram.totalGb} GB`,
    value: `${input.identity.ram.totalGb} GB`,
    hint: input.identity.ram.modules.length
      ? `${input.identity.ram.modules.length} module${input.identity.ram.modules.length === 1 ? "" : "s"}`
      : "",
    referencePct: null,
    referenceVerdict: null,
    referenceNote: "",
  });

  input.identity.disks.forEach((disk, index) => {
    const healthy = disk.health.toLowerCase() === "healthy";
    rows.push({
      id: `disk-${index}`,
      kind: "storage",
      label: input.identity.disks.length > 1 ? `Storage ${index + 1}` : "Storage",
      name: disk.model,
      value: disk.health || "—",
      hint: `${disk.sizeGb} GB ${disk.type}`,
      tone: !disk.health ? undefined : healthy ? "text-emerald-300" : "text-red-400",
      referencePct: null,
      referenceVerdict: null,
      referenceNote: "",
    });
  });

  const battery = input.identity.battery;
  if (battery) {
    rows.push({
      id: "battery",
      kind: "battery",
      label: "Battery",
      name: `${(battery.fullMwh / 1000).toFixed(1)} of ${(battery.designMwh / 1000).toFixed(1)} Wh`,
      value: `${battery.healthPct}%`,
      hint: `${battery.cycles} cycles · of design capacity`,
      tone: battery.healthPct >= 85 ? "text-emerald-300" : battery.healthPct >= 70 ? "text-amber-300" : "text-red-400",
      referencePct: null,
      referenceVerdict: null,
      referenceNote: "",
    });
  }

  return rows;
}

export function groupPartRows(rows: PartRow[], scope: SaleScope) {
  if (scope === "device") return { product: rows, bench: [] as PartRow[] };
  return {
    product: rows.filter((row) => row.kind === scope),
    bench: rows.filter((row) => row.kind !== scope),
  };
}

/** Worst Blender percent among the parts this sale certifies. */
export function soldReferencePct(rows: PartRow[], scope: SaleScope, partIndex = 0) {
  if (scope === "cpu") return rows.find((row) => row.kind === "cpu")?.referencePct ?? null;
  if (scope === "gpu") {
    const gpus = rows.filter((row) => row.kind === "gpu");
    return gpus[partIndex]?.referencePct ?? gpus[0]?.referencePct ?? null;
  }
  if (scope === "device") {
    const nums = rows
      .filter((row) => row.kind === "cpu" || row.kind === "gpu")
      .map((row) => row.referencePct)
      .filter((value): value is number => value != null);
    return nums.length ? Math.min(...nums) : null;
  }
  return null;
}

export function scoreInputFromSession(session: Session): ScoreInput | null {
  if (!session.identity || !session.results) return null;
  return {
    identity: session.identity,
    results: session.results,
    gpuScore: session.gpuScore,
    memoryScore: session.memoryScore,
    stressTier: session.stressTier,
  };
}

export function scoreInputFromListing(listing: Listing): ScoreInput {
  return {
    identity: listing.identity,
    results: listing.results,
    gpuScore: listing.gpuScore,
    memoryScore: listing.memoryScore,
    stressTier: listing.stressTier,
  };
}

export function listingMiddle(listing: Listing, rows: PartRow[]): { value: string; label: string } {
  const scope = listing.saleScope ?? (listing.kind === "part" ? "gpu" : "device");
  if (scope === "ram") return { value: `${listing.identity.ram.totalGb} GB`, label: "memory" };
  if (scope === "storage") return { value: listing.identity.disks[0]?.health || "—", label: "drive" };
  if (scope === "battery") return { value: listing.identity.battery ? `${Math.round(listing.identity.battery.healthPct)}%` : "—", label: "battery" };
  if (scope === "cpu") {
    const row = rows.find((item) => item.kind === "cpu");
    if (row?.referencePct != null) return { value: `${row.referencePct}%`, label: "vs junkshop" };
    const cpuRun = listing.results.checks?.blender?.cpu;
    if (cpuRun?.ran && cpuRun.samplesPerMin != null) {
      return { value: Math.round(cpuRun.samplesPerMin).toLocaleString("en-US"), label: "junkshop /min" };
    }
    return { value: listing.results.cpu.multiScore.toLocaleString("en-US"), label: "CPU score" };
  }
  const gpu = rows.find((item) => item.kind === "gpu");
  if (gpu?.referencePct != null) return { value: `${gpu.referencePct}%`, label: "vs junkshop" };
  const gpuRun = listing.results.checks?.blender?.gpu;
  if (gpuRun?.ran && gpuRun.samplesPerMin != null) {
    return { value: Math.round(gpuRun.samplesPerMin).toLocaleString("en-US"), label: "junkshop /min" };
  }
  return { value: listing.gpuScore ? String(listing.gpuScore.fps) : "—", label: "GPU fps" };
}
