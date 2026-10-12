/**
 * Extend the GT 1030 listing with a simulated stress + mining endurance run,
 * then commit that report hash in a devnet memo signed by the shop key.
 */
import { readFileSync, writeFileSync } from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction } from "@solana/web3.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");
const dbFile = path.join(here, "..", "data", "db.json");
const MEMO = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
const id = "c0ffee1030ab";

const db = JSON.parse(readFileSync(dbFile, "utf8"));
const listing = db.listings.find((item) => item.id === id);
if (!listing) {
  console.error("GT 1030 listing is missing");
  process.exit(1);
}

const stress = listing.samples.filter((sample) => sample.phase !== "mining");
const last = stress[stress.length - 1];
const mining = [];
for (let step = 1; step <= 45; step++) {
  const t = last.t + step;
  const rise = Math.min(step, 12);
  mining.push({
    t,
    phase: "mining",
    gpuTemp: Math.min(73, last.gpuTemp + rise),
    gpuUtil: 98 + (step % 2),
    gpuPower: step % 4 === 0 ? 29 : 30,
    gpuClock: 1180 + (step % 4) * 15,
    throttle: false,
  });
}
listing.samples = [...stress, ...mining];
listing.results.mining = { simulated: true, durationS: 45, maxTemp: 73, avgPowerW: 30, memoryGBps: 40 };
listing.results.checks = {
  abortedHot: false,
  abortTempC: 90,
  gpuStressS: 24,
  memoryStressS: 45,
  note: "Stress, then a simulated 45s mining endurance pass at the 30 W cap. No miner was run.",
};
listing.notes = "Pulled from a Dell OptiPlex used as an office PC. 2 GB, 30 W card. Stress peaked at 66°C. The mining band is simulated: temperature holds near 73°C at 30 W, about 40 GB/s, no throttling. No mining program was run. A used GT 1030 is normally about $40–70. Listed at 0.05 SOL so a devnet payment can be tested.";

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

const memo = [
  "Dibs GT1030 report",
  `listing ${listing.id}`,
  `fingerprint ${listing.deviceHash}`,
  `report ${listing.reportHash}`,
  "stress 24s peak 66C 34fps throttle 0",
  "mining-sim 45s peak 73C 30W 40GB/s",
  "simulated endurance, no miner",
].join("\n");

const admin = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(path.join(root, "keypairs", "devnet-admin.json"), "utf8"))));
const conn = new Connection("https://api.devnet.solana.com", "confirmed");
const balance = await conn.getBalance(admin.publicKey);
if (balance < 20_000) {
  console.error("Shop wallet is short on SOL:", balance);
  process.exit(1);
}

const tx = new Transaction().add(new TransactionInstruction({
  programId: MEMO,
  keys: [{ pubkey: admin.publicKey, isSigner: true, isWritable: true }],
  data: Buffer.from(memo, "utf8"),
}));
const signature = await conn.sendTransaction(tx, [admin]);
await conn.confirmTransaction(signature, "confirmed");
listing.chainReport = { signature };
writeFileSync(dbFile, JSON.stringify(db, null, 2));
console.log(signature);
console.log("bytes", Buffer.byteLength(memo));
