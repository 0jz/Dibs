import type { Grade, Identity, Results, SaleScope, StressTierId } from "@/lib/types";
import { modelTempBand, resolveGpuTemps } from "@/lib/limits";

const RANK: Record<Grade, number> = { C: 0, B: 1, A: 2 };

export type GradeSuggestion = { grade: Grade; reasons: string[] };

function cap(grade: Grade, max: Grade) {
  return RANK[grade] > RANK[max] ? max : grade;
}

function drop(grade: Grade): Grade {
  if (grade === "A") return "B";
  if (grade === "B") return "C";
  return "C";
}

/** A starting suggestion. The shop can still publish a different grade. */
export function suggestGrade(input: {
  identity: Identity;
  results: Results | null;
  saleScope: SaleScope;
  stressTier?: StressTierId | null;
  /** Blender junkshop samples/min as a percent of the model median. Under 85 caps at B, under 70 drops one grade. */
  referencePct?: number | null;
  partIndex?: number;
}): GradeSuggestion {
  const reasons: string[] = [];
  let grade: Grade = "A";
  const gpu = input.results?.gpu;
  const checks = input.results?.checks;
  const tier = checks?.stressTier ?? input.stressTier;
  const gpuMatters = input.saleScope === "device" || input.saleScope === "gpu";
  const diskMatters = input.saleScope === "device" || input.saleScope === "storage";
  const batteryMatters = input.saleScope === "device" || input.saleScope === "battery";
  const device = input.identity.deviceType;
  const gpuName = input.identity.gpus[input.partIndex ?? 0]?.name ?? input.identity.gpus[0]?.name ?? "";

  const recorded = checks?.limits;
  const temps =
    recorded && recorded.abortTempC
      ? {
          warnC: recorded.warnTempC,
          stopC: recorded.abortTempC,
          source: recorded.source,
        }
      : resolveGpuTemps({
          gpuName,
          device,
          slowdownTempC: recorded?.slowdownTempC ?? null,
        });

  if (tier === "light") {
    grade = cap(grade, "B");
    reasons.push("Light check can suggest B at best.");
  }
  if (gpuMatters && checks?.abortedHot) {
    grade = cap(grade, "C");
    reasons.push("The load was stopped because the GPU got too hot.");
  }
  if (gpuMatters && (gpu?.throttleSamples ?? 0) > 0) {
    grade = cap(grade, "C");
    reasons.push("Thermal throttling was detected.");
  }
  if (gpuMatters && gpu) {
    if (gpu.maxTemp >= temps.stopC) {
      grade = cap(grade, "C");
      reasons.push(`Peak temperature was ${gpu.maxTemp}°C (stop ${temps.stopC}°C · ${temps.source}).`);
    } else if (gpu.maxTemp >= temps.warnC) {
      grade = cap(grade, "B");
      reasons.push(`Peak temperature was ${gpu.maxTemp}°C (warn ${temps.warnC}°C · ${temps.source}).`);
    }
  }
  const disks =
    input.saleScope === "storage"
      ? input.identity.disks.filter((_, index) => index === (input.partIndex ?? 0))
      : input.identity.disks;
  if (diskMatters && disks.some((d) => d.health && d.health.toLowerCase() !== "healthy")) {
    grade = cap(grade, "C");
    reasons.push("A drive did not report healthy.");
  }
  const health = input.identity.battery?.healthPct;
  if (batteryMatters && health != null && health < 70) {
    grade = cap(grade, "C");
    reasons.push(`Battery health is ${health}%.`);
  } else if (batteryMatters && health != null && health < 85) {
    grade = cap(grade, "B");
    reasons.push(`Battery health is ${health}%.`);
  }
  const measured = checks?.hashrate?.mhPerS;
  const reference = checks?.hashrate?.referenceMhS;
  if (gpuMatters && measured != null && reference != null && reference > 0 && measured / reference < 0.7) {
    grade = drop(grade);
    reasons.push("Hashrate was far under the reference for this model.");
  }
  if (input.referencePct != null && input.referencePct < 70) {
    grade = drop(grade);
    reasons.push("Junkshop was under 70% of the Blender Open Data median for this model.");
  } else if (input.referencePct != null && input.referencePct < 85) {
    grade = cap(grade, "B");
    reasons.push(`Junkshop was ${input.referencePct}% of the Blender Open Data median, below the normal range for this model.`);
  }
  if (reasons.length === 0) {
    reasons.push(
      tier === "bench" && gpuMatters ? "Bench run showed no heat or throttle problem." : "Nothing in this run lowered the suggestion.",
    );
  }
  return { grade, reasons };
}

/** Exported for tests / staff notes. */
export function gradeTempBand(identity: Identity, results: Results | null, partIndex = 0) {
  const gpuName = identity.gpus[partIndex]?.name ?? identity.gpus[0]?.name ?? "";
  const recorded = results?.checks?.limits;
  if (recorded?.abortTempC) {
    return { warnC: recorded.warnTempC, stopC: recorded.abortTempC, source: recorded.source };
  }
  if (gpuName) {
    return resolveGpuTemps({
      gpuName,
      device: identity.deviceType,
      slowdownTempC: recorded?.slowdownTempC ?? null,
    });
  }
  return modelTempBand(identity.cpu.name, "cpu", identity.deviceType);
}
