import { deviceKey } from "@/lib/format";
import limitsFile from "@/reference/limits.json";

export type TempBand = { warnC: number; stopC: number };

type LimitsFile = {
  fallback: { laptop: TempBand; desktop: TempBand };
  gpus: { key: string; warnC: number; stopC: number }[];
  cpus: { key: string; warnC: number; stopC: number }[];
};

const file = limitsFile as LimitsFile;

function sameKey(queryKey: string, entryKey: string) {
  return queryKey === entryKey || queryKey.startsWith(entryKey + " ") || entryKey.startsWith(queryKey + " ");
}

function matchRow(name: string, rows: { key: string; warnC: number; stopC: number }[]): TempBand | null {
  const key = deviceKey(name);
  if (!key) return null;
  const hit = rows.filter((row) => sameKey(key, row.key)).sort((a, b) => b.key.length - a.key.length)[0];
  return hit ? { warnC: hit.warnC, stopC: hit.stopC } : null;
}

/** Model-table band, or the labeled laptop/desktop fallback. */
export function modelTempBand(name: string, kind: "gpu" | "cpu", device: "laptop" | "desktop"): TempBand & { source: "model" | "fallback" } {
  const fromTable = matchRow(name, kind === "gpu" ? file.gpus : file.cpus);
  if (fromTable) return { ...fromTable, source: "model" };
  const fallback = file.fallback[device] ?? (device === "laptop" ? { warnC: 75, stopC: 80 } : { warnC: 83, stopC: 88 });
  return { ...fallback, source: "fallback" };
}

/**
 * Prefer the driver's slowdown temperature as the stop. Warn is a few degrees under that,
 * or the model table warn when that is lower.
 */
export function resolveGpuTemps(input: {
  gpuName: string;
  device: "laptop" | "desktop";
  slowdownTempC?: number | null;
}): { warnC: number; stopC: number; source: "driver" | "model" | "fallback"; slowdownTempC: number | null } {
  const band = modelTempBand(input.gpuName, "gpu", input.device);
  const slowdown = input.slowdownTempC != null && input.slowdownTempC > 40 && input.slowdownTempC < 120 ? input.slowdownTempC : null;
  if (slowdown != null) {
    const warnC = Math.min(band.warnC, Math.max(slowdown - 8, slowdown - 5));
    return { warnC, stopC: slowdown, source: "driver", slowdownTempC: slowdown };
  }
  return { warnC: band.warnC, stopC: band.stopC, source: band.source, slowdownTempC: null };
}
