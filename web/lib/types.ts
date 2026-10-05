export type Identity = {
  deviceType: "laptop" | "desktop";
  system: { manufacturer: string; model: string; biosSerial: string };
  cpu: { name: string; cores: number; threads: number };
  ram: {
    totalGb: number;
    modules: { capacityGb: number; speedMts: number; manufacturer: string; part: string }[];
  };
  gpus: { name: string; uuid: string; vbios: string; vramMb: number; driver: string; maxClockMhz: number }[];
  disks: { model: string; type: string; health: string; sizeGb: number }[];
  battery: { designMwh: number; fullMwh: number; healthPct: number; cycles: number } | null;
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
  checks?: TestChecks;
};

export type GpuScore = {
  fps: number;
  frames: number;
  renderer: string;
  mode?: "core" | "memory";
  profile?: "pc" | "phone";
  aborted?: boolean;
  batteryStartPct?: number | null;
  batteryEndPct?: number | null;
};

export type TestChecks = {
  abortedHot: boolean;
  abortTempC: number;
  gpuStressS: number;
  memoryStressS: number;
  note: string;
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
  /** Set when a sample hits the temperature stop. The stress page polls this. */
  abort?: boolean;
  listingId: string | null;
};

export type Listing = {
  id: string;
  sessionId: string;
  title: string;
  price: number;
  currency: "EUR" | "USDC" | "MON";
  seller: string;
  store: string;
  grade: Grade;
  notes: string;
  sealId: string;
  /** Missing on listings published before part listings existed: treat as "device". */
  kind?: ListingKind;
  /** The fingerprint checked on delivery: the GPU's part hash for "part", the whole-device hash for "device". */
  deviceHash: string;
  reportHash: string;
  identity: Identity;
  results: Results;
  gpuScore: GpuScore | null;
  memoryScore?: GpuScore | null;
  samples: Sample[];
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
