import "server-only";
import { deviceKey, loadCatalog, type RefScene } from "@/lib/reference";
import type { BlenderRun, Results } from "@/lib/types";

export const PINNED_BLENDER_VERSION = "4.5.0";
export const JUNKSHOP = "junkshop";

/** Higher samples per minute is faster. Percent over 100 means quicker than the crowd median. */
export function blenderPercent(median: number, measured: number) {
  if (!(median > 0) || !(measured > 0) || !Number.isFinite(measured)) return null;
  return Math.round((measured / median) * 100);
}

export type PerfVerdict = "above" | "normal" | "low" | "below";

/** Fewer runs than this and the bands are too thin to alert on. */
export const MIN_REFERENCE_RUNS = 30;

export function perfVerdict(measured: number, spm: RefScene["spm"]): PerfVerdict {
  if (measured < spm.p10) return "below";
  if (measured < spm.p25) return "low";
  if (measured > spm.p95 * 1.1) return "above";
  return "normal";
}

export function junkshopScene(name: string, api: "CUDA" | "CPU", blenderVersion?: string | null): (RefScene & { api: string; samples: number; deviceName: string }) | null {
  const cat = loadCatalog();
  const key = deviceKey(name);
  if (!cat || !key) return null;
  const kind = api === "CPU" ? "CPU" : "GPU";
  const pool = cat.devices.filter((d) => d.kind === kind && d.api === api && (d.key === key || d.key.startsWith(key + " ") || key.startsWith(d.key + " ")));
  const device = pool.sort((a, b) => b.n - a.n)[0];
  if (!device) return null;
  const scenes = device.scenes.filter((s) => s.label.toLowerCase() === JUNKSHOP);
  if (!scenes.length) return null;
  const version = blenderVersion?.trim();
  const versioned = version ? scenes.filter((s) => !s.blenderVersion || s.blenderVersion === version) : scenes;
  const pick = (versioned.length ? versioned : scenes).sort((a, b) => b.n - a.n)[0];
  if (!pick) return null;
  return { ...pick, api: device.api, samples: pick.n, deviceName: device.name };
}

export type PerformanceHit = {
  percent: number;
  measured: number;
  median: number;
  verdict: PerfVerdict | null;
  note: string;
};

export function scoreJunkshop(name: string, run: BlenderRun | null | undefined): PerformanceHit | null {
  if (!run?.ran || run.samplesPerMin == null || run.samplesPerMin <= 0) return null;
  if (run.aborted) return null;
  if (run.scene.toLowerCase() !== JUNKSHOP) return null;
  const scene = junkshopScene(name, run.api, run.blenderVersion);
  if (!scene) return null;
  if (run.blenderVersion && scene.blenderVersion && run.blenderVersion !== scene.blenderVersion) return null;
  const percent = blenderPercent(scene.spm.median, run.samplesPerMin);
  if (percent == null) return null;
  const thin = scene.samples < MIN_REFERENCE_RUNS;
  return {
    percent,
    measured: run.samplesPerMin,
    median: scene.spm.median,
    verdict: thin ? null : perfVerdict(run.samplesPerMin, scene.spm),
    note: `${scene.spm.median} samples/min median · ${run.api} · n=${scene.samples}${scene.blenderVersion ? ` · Blender ${scene.blenderVersion}` : ""}${thin ? " · too few runs to judge" : ""}`,
  };
}

export function blenderFromResults(results: Results | null | undefined) {
  return results?.checks?.blender ?? null;
}
