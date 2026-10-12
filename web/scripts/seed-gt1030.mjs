import { readFileSync, writeFileSync } from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const file = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "data", "db.json");
const db = JSON.parse(readFileSync(file, "utf8"));
const id = "c0ffee1030ab";
if (db.listings.some((listing) => listing.id === id)) {
  console.log("already there");
  process.exit(0);
}

const uuid = "GPU-4c3b2a19-7e55-4d10-9a88-0c11d2e3f405";
const vbios = "86.07.59.00.30";
const fingerprint = "0x" + crypto.createHash("sha256").update(`{"gpu": "${uuid}|${vbios}"}`).digest("hex");
const samples = [];
for (let t = 0; t <= 32; t++) {
  const gpu = t >= 8;
  samples.push({
    t,
    phase: gpu ? "gpu" : "cpu",
    gpuTemp: gpu ? Math.round(46 + (t - 8) * 0.85) : 41 + (t % 2),
    gpuUtil: gpu ? 94 + (t % 3) - 1 : 2,
    gpuPower: gpu ? 27 + (t % 3) : 4,
    gpuClock: gpu ? 1280 + (t % 5) * 20 : 139,
    throttle: false,
  });
}
const temps = samples.filter((sample) => sample.phase === "gpu").map((sample) => sample.gpuTemp);
const listing = {
  id,
  sessionId: "seed-gt1030",
  title: "NVIDIA GeForce GT 1030 2GB · office card",
  price: 0.05,
  currency: "SOL",
  seller: "Nikola (demo)",
  sellerWallet: "7f7Gqo2rCMXSRdeqR7spLkx8vS9U6YLH1KH6xTVBrmEL",
  priceBase: "50000000",
  store: "Tezga Demo Shop · Belgrade",
  grade: "B",
  notes: "Pulled from a Dell OptiPlex used as an office PC. 2 GB, 30 W card. Peak 67°C, no throttling, clock held near 1.4 GHz. Listed at 0.05 SOL so a devnet payment can be tested. A used GT 1030 is normally about $40–70.",
  sealId: "TZ-000002",
  kind: "part",
  deviceHash: fingerprint,
  identity: {
    deviceType: "desktop",
    system: { manufacturer: "Dell Inc.", model: "OptiPlex 3050", biosSerial: "DEMO-GT1030-OFFICE" },
    cpu: { name: "Intel(R) Core(TM) i5-7500 CPU @ 3.40GHz", cores: 4, threads: 4 },
    ram: { totalGb: 8, modules: [{ capacityGb: 8, speedMts: 2400, manufacturer: "Samsung", part: "M378A1K43CB2-CRC" }] },
    gpus: [{ name: "NVIDIA GeForce GT 1030", uuid, vbios, vramMb: 2048, driver: "32.0.15.6590", maxClockMhz: 1468 }],
    disks: [{ model: "Samsung SSD 860 EVO 250GB", type: "SSD", health: "Healthy", sizeGb: 250 }],
    battery: null,
    os: "Windows 10 Pro",
  },
  results: {
    cpu: { singleScore: 820, multiScore: 3100, threads: 4 },
    gpu: {
      durationS: 24,
      maxTemp: Math.max(...temps),
      avgTemp: Math.round(temps.reduce((sum, value) => sum + value, 0) / temps.length),
      avgUtil: 95,
      maxPowerW: 29,
      maxClockMhz: 1380,
      throttleSamples: 0,
    },
    checks: { abortedHot: false, abortTempC: 90, gpuStressS: 24, memoryStressS: 12, note: "Office card. Short load only, stopped well under 90°C." },
  },
  gpuScore: { fps: 34, frames: 816, renderer: "ANGLE (NVIDIA, NVIDIA GeForce GT 1030 Direct3D11 vs_5_0 ps_5_0)", mode: "core", profile: "pc", aborted: false },
  memoryScore: { fps: 11, frames: 132, renderer: "ANGLE (NVIDIA, NVIDIA GeForce GT 1030 Direct3D11 vs_5_0 ps_5_0)", mode: "memory", profile: "pc", aborted: false },
  samples,
  testedAt: "2026-10-05T14:10:00.000Z",
  publishedAt: "2026-10-05T15:50:00.000Z",
  status: "for_sale",
};
const report = {
  kind: listing.kind,
  store: listing.store,
  testedAt: listing.testedAt,
  deviceHash: listing.deviceHash,
  identity: listing.identity,
  results: listing.results,
  gpuScore: listing.gpuScore,
  memoryScore: listing.memoryScore,
  grade: listing.grade,
  sealId: listing.sealId,
  notes: listing.notes,
  sellerWallet: listing.sellerWallet,
  priceBase: listing.priceBase,
  currency: listing.currency,
};
listing.reportHash = "0x" + crypto.createHash("sha256").update(JSON.stringify(report)).digest("hex");
db.listings.push(listing);
writeFileSync(file, JSON.stringify(db, null, 2));
console.log(fingerprint);
