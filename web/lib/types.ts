import type { StressTierId } from "@/lib/tests";

export type { StressTierId };

export type Identity = {
  deviceType: "laptop" | "desktop";
  system: { manufacturer: string; model: string; biosSerial: string };
  cpu: { name: string; cores: number; threads: number; processorId?: string };
  ram: {
    totalGb: number;
    modules: { capacityGb: number; speedMts: number; manufacturer: string; part: string }[];
  };
  gpus: { name: string; uuid: string; vbios: string; vramMb: number; driver: string; maxClockMhz: number }[];
  disks: { model: string; type: string; health: string; sizeGb: number; serial?: string }[];
  battery: { designMwh: number; fullMwh: number; healthPct: number; cycles: number; serial?: string | null } | null;
  os: string;
};

export type Sample = {
  t: number;
  phase: string;
  gpuTemp: number | null;
  gpuUtil: number | null;
  gpuPower: number | null;
  gpuClock: number | null;
  throttle: boolean;
};

export type Results = {
  cpu: { singleScore: number; multiScore: number; threads: number };
  gpu: {
    durationS: number;
    maxTemp: number;
    avgTemp: number;
    avgUtil: number | null;
    maxPowerW: number | null;
    maxClockMhz: number | null;
    throttleSamples: number;
  } | null;
  /** Shop simulation of a memory endurance pass. Not a pool miner and not a payout. */
  mining?: {
    simulated: true;
    durationS: number;
    maxTemp: number;
    avgPowerW: number;
    memoryGBps: number;
  };
  checks?: TestChecks;
};

export type GpuScore = {
  fps: number;
  frames: number;
  renderer: string;
  mode?: "core" | "memory";
  profile?: "pc" | "phone" | "laptop";
  tier?: StressTierId;
  aborted?: boolean;
  batteryStartPct?: number | null;
  batteryEndPct?: number | null;
};

/** Official Blender Benchmark Launcher junkshop run. Samples per minute match Open Data. */
export type BlenderRun = {
  scene: string;
  api: "CUDA" | "CPU";
  blenderVersion: string;
  sceneId?: string | null;
  /** Wall time of the run. Not comparable: the scene renders for a fixed time limit. */
  seconds: number | null;
  /** Blender's own speed metric. This is what the Open Data reference is scored in. */
  samplesPerMin?: number | null;
  ran: boolean;
  aborted?: boolean;
  note: string;
};

export type ThermalLimitsUsed = {
  abortTempC: number;
  warnTempC: number;
  source: "driver" | "model" | "fallback";
  powerLimitW?: number | null;
  slowdownTempC?: number | null;
};

export type TestChecks = {
  abortedHot: boolean;
  abortTempC: number;
  gpuStressS: number;
  memoryStressS: number;
  stressTier: StressTierId;
  /** True when the laptop charger was in. Null when the machine has no battery reading. */
  onAc: boolean | null;
  /** Set when the shader was not started. */
  loadSkipped?: string | null;
  /** Bench uses memtest_vulkan when that binary is installed. Otherwise the short bandwidth shader. */
  vramTool?: "bandwidth" | "memtest_vulkan" | null;
  hashrate?: {
    requested: boolean;
    ran: boolean;
    mhPerS: number | null;
    referenceMhS: number | null;
    note: string;
  };
  /** Official junkshop Cycles runs when the Benchmark Launcher is installed. */
  blender?: {
    pinnedVersion: string;
    cpu: BlenderRun;
    gpu: BlenderRun | null;
  };
  /** How the abort temperature for this run was chosen. */
  limits?: ThermalLimitsUsed;
  note: string;
  burnIn: "not run";
};

/** What the shop is certifying. Anything other than the whole PC is one part. */
export type SaleScope = "device" | "gpu" | "cpu" | "ram" | "storage" | "battery";

export type Fingerprints = {
  device: string;
  gpus: string[];
  cpu: string | null;
  ram: string | null;
  disks: (string | null)[];
  battery: string | null;
};

export type SessionStatus = "waiting" | "testing" | "done" | "published";

export type Grade = "A" | "B" | "C";

/** "part": a single GPU, verified by its own fingerprint in any PC. "device": a whole laptop/PC, verified incl. BIOS serial. */
export type ListingKind = "part" | "device";

export type Session = {
  id: string;
  code: string;
  createdAt: string;
  status: SessionStatus;
  phase: string;
  identity: Identity | null;
  deviceHash: string | null;
  /** One per entry in identity.gpus (missing on sessions from older agents). */
  partHashes?: string[];
  samples: Sample[];
  results: Results | null;
  gpuScore: GpuScore | null;
  /** Second WebGL pass: VRAM bandwidth. Phones use this as the endurance score. */
  memoryScore?: GpuScore | null;
  /** Set when a sample hits the temperature stop, or when Stop is pressed. The stress page polls this. */
  abort?: boolean;
  /** Null until the shop picks one. The agent then uses Light on a laptop and Standard on a desktop. */
  stressTier?: StressTierId | null;
  /** Chosen before the command is copied. Missing on older sessions: treat as a whole PC. */
  saleScope?: SaleScope;
  /** Optional offline hashrate check. Light cannot turn this on. */
  hashrate?: boolean;
  fingerprints?: Fingerprints;
  /** Temperature that sets abort for this run. Laptops are lower than desktop benches. */
  abortTempC?: number;
  onAc?: boolean | null;
  listingId: string | null;
};

export type Listing = {
  id: string;
  sessionId: string;
  title: string;
  price: number;
  currency: "EUR" | "USDC" | "MON" | "SOL";
  seller: string;
  /** Seller's Solana wallet. Required for SOL and USDC escrow. */
  sellerWallet?: string;
  /** Integer base units: lamports for SOL, 6-decimal minor units for USDC. */
  priceBase?: string;
  store: string;
  grade: Grade;
  notes: string;
  sealId: string;
  /** Missing on listings published before part listings existed: treat as "device". */
  kind?: ListingKind;
  /** Which part the fingerprint belongs to. Missing on older listings. */
  saleScope?: SaleScope;
  /** The fingerprint checked on delivery: the GPU's part hash for "part", the whole-device hash for "device". */
  deviceHash: string;
  reportHash: string;
  identity: Identity;
  results: Results;
  gpuScore: GpuScore | null;
  memoryScore?: GpuScore | null;
  samples: Sample[];
  /** Tier the shop ran. Missing on listings published before tiers existed. */
  stressTier?: StressTierId | null;
  /** Shop-signed devnet memo that commits this report hash. */
  chainReport?: { signature: string };
  testedAt: string;
  publishedAt: string;
  status: "for_sale" | "sold";
};

export type Verification = {
  id: string;
  listingId: string;
  deviceHash: string;
  match: boolean;
  summary: { model: string; cpu: string; gpus: string[] };
  at: string;
};

export type DB = {
  sessions: Session[];
  listings: Listing[];
  verifications: Verification[];
};
