/**
 * Shop-bench limits. These are the durations a partner store is allowed to run.
 * A miner is not part of the test: memory wear shows up as VRAM errors and a
 * short bandwidth load, and a miner can push the memory junction past 105°C
 * without nvidia-smi on GeForce ever reporting it.
 */
export const TEST_LIMITS = {
  abortTempC: 90,
  gpuStressDefaultS: 45,
  gpuStressMaxS: 90,
  memoryDefaultS: 20,
  memoryMaxS: 30,
  phoneStressMaxS: 20,
  phoneEnduranceMaxS: 25,
} as const;

export function clampSeconds(requested: number, max: number, min = 5) {
  const n = Number.isFinite(requested) ? requested : max;
  return Math.min(max, Math.max(min, Math.round(n)));
}
