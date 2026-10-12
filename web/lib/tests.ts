/**
 * Shop-bench stress tiers. A longer run is a different measurement, not a
 * harder version of the same one: the die ramps in seconds, the cooler levels
 * off over a few minutes, and worn memory shows up as errors once it is hot.
 *
 * The agent in public/dibs_agent.py copies these numbers. Keep the two in sync.
 * A miner is not part of any tier.
 */

export type StressTierId = "light" | "standard" | "bench";

export type StressTier = {
  id: StressTierId;
  /** Name on the report. Light is a check, not a certification. */
  label: string;
  summary: string;
  doesNotProve: string;
  coreS: number;
  memoryS: number;
  cpuS: number;
  /** Fallback only when nvidia-smi and the model table are silent. */
  abortLaptopC: number;
  /** Fallback only when nvidia-smi and the model table are silent. */
  abortDesktopC: number;
  /** Fixed shader passes for Light. Desktop Standard and Bench may ramp up to this. */
  passCap: number;
  width: number;
  height: number;
};

export const STRESS_TIERS: Record<StressTierId, StressTier> = {
  light: {
    id: "light",
    label: "Light check",
    summary: "Light check: the part identifies, displays, and does not fall over in the first seconds. This is not a certification. Junkshop is not run.",
    doesNotProve: "Does not prove sustained temperature, throttle at equilibrium, VRAM health, or a Blender performance score.",
    coreS: 15,
    memoryS: 0,
    cpuS: 6,
    abortLaptopC: 80,
    abortDesktopC: 85,
    passCap: 4,
    width: 1280,
    height: 720,
  },
  standard: {
    id: "standard",
    label: "Standard",
    summary: "Standard test: heat sample, VRAM pass, and an official junkshop Cycles render to compare with Blender Open Data.",
    doesNotProve: "Does not prove a full memory-error pass or faults that appear only after the heatsink is heat-soaked.",
    coreS: 60,
    memoryS: 20,
    cpuS: 15,
    abortLaptopC: 80,
    abortDesktopC: 88,
    passCap: 64,
    width: 1920,
    height: 1080,
  },
  bench: {
    id: "bench",
    label: "Bench",
    summary: "Bench test: longer heat soak, longer VRAM pass, and the same official junkshop Cycles render. This is the tier that can support a grade.",
    doesNotProve: "Does not prove intermittent faults.",
    coreS: 180,
    memoryS: 180,
    cpuS: 15,
    abortLaptopC: 80,
    abortDesktopC: 88,
    passCap: 64,
    width: 1920,
    height: 1080,
  },
};

export const BURN_IN_NOTE = "Burn-in was not run.";

/** Standard and Bench on a laptop stay well under the desktop ramp. */
export const LAPTOP_PASS_CAP = 8;

export const TEST_LIMITS = {
  abortTempC: STRESS_TIERS.standard.abortDesktopC,
  gpuStressDefaultS: STRESS_TIERS.standard.coreS,
  gpuStressMaxS: STRESS_TIERS.bench.coreS,
  memoryDefaultS: STRESS_TIERS.standard.memoryS,
  memoryMaxS: STRESS_TIERS.bench.memoryS,
  phoneStressMaxS: 20,
  phoneEnduranceMaxS: 25,
} as const;

const TIER_IDS: StressTierId[] = ["light", "standard", "bench"];

export function isStressTier(value: unknown): value is StressTierId {
  return typeof value === "string" && (TIER_IDS as string[]).includes(value);
}

export function abortTempC(tier: StressTierId, device: "laptop" | "desktop") {
  const row = STRESS_TIERS[tier];
  return device === "laptop" ? row.abortLaptopC : row.abortDesktopC;
}

export function shaderFor(tier: StressTierId, device: "laptop" | "desktop" | "phone") {
  const row = STRESS_TIERS[tier];
  if (device === "phone") return { width: 1280, height: 720, passCap: 4, ramp: false };
  if (tier === "light") return { width: row.width, height: row.height, passCap: row.passCap, ramp: false };
  if (device === "laptop") return { width: row.width, height: row.height, passCap: LAPTOP_PASS_CAP, ramp: false };
  return { width: row.width, height: row.height, passCap: row.passCap, ramp: true };
}

export function clampSeconds(requested: number, max: number, min = 5) {
  const n = Number.isFinite(requested) ? requested : max;
  return Math.min(max, Math.max(min, Math.round(n)));
}
