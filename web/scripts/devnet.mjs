/**
 * Deploy dibs_escrow.so to devnet and init it.
 * The .so comes from the GitHub Action (this machine has no Rust).
 *
 *   node web/scripts/devnet.mjs
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BPF_LOADER_PROGRAM_ID, BpfLoader, Connection, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction } from "@solana/web3.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");
const keys = path.join(root, "keypairs");
const elfPath = path.join(root, "program", "escrow", "target", "deploy", "dibs_escrow.so");
const USDC_MINT = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
const day = 24 * 60 * 60;
const demo = Number(process.env.ESCROW_TIMEOUT_SECS || 0);
const ship = BigInt(demo || 7 * day);
const protection = BigInt(demo || 90 * day);

function u16(n) {
  const buf = Buffer.alloc(2);
  buf.writeUInt16LE(n);
  return buf;
}
function u64(n) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(n);
  return buf;
}

function load(file) {
  const full = path.join(keys, file);
  if (existsSync(full)) return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(full, "utf8"))));
  const kp = Keypair.generate();
  mkdirSync(keys, { recursive: true });
  writeFileSync(full, JSON.stringify(Array.from(kp.secretKey)));
  return kp;
}

if (!existsSync(elfPath)) {
  console.error("Missing program binary. Download the dibs-escrow GitHub Actions artifact to");
  console.error(elfPath);
  process.exit(1);
}

const admin = load("devnet-admin.json");
const program = load("program.json");
const conn = new Connection("https://api.devnet.solana.com", "confirmed");
const [config] = PublicKey.findProgramAddressSync([Buffer.from("config")], program.publicKey);

async function airdrop(to) {
  try {
    const sig = await conn.requestAirdrop(to, 2_000_000_000);
    await conn.confirmTransaction(sig, "confirmed");
    console.log("airdrop", to.toBase58());
  } catch (error) {
    console.log("airdrop failed for", to.toBase58(), error instanceof Error ? error.message : error);
    console.log("Fund it at https://faucet.solana.com");
  }
}

console.log("admin", admin.publicKey.toBase58());
console.log("program", program.publicKey.toBase58());
await airdrop(admin.publicKey);
const bal = await conn.getBalance(admin.publicKey);
if (bal < 1_500_000_000) {
  console.error("Need at least 1.5 SOL on the admin wallet to deploy. Balance:", bal);
  process.exit(1);
}

const elf = readFileSync(elfPath);
console.log("deploying", elf.length, "bytes");
await BpfLoader.load(conn, admin, program, elf, BPF_LOADER_PROGRAM_ID);
writeFileSync(path.join(keys, "program-id.txt"), program.publicKey.toBase58());

const data = Buffer.concat([Buffer.from([0]), u16(400), u64(ship), u64(ship), u64(protection), u64(ship), u64(ship)]);
const tx = new Transaction().add(new TransactionInstruction({
  programId: program.publicKey,
  keys: [
    { pubkey: admin.publicKey, isSigner: true, isWritable: true },
    { pubkey: config, isSigner: false, isWritable: true },
    { pubkey: new PublicKey(USDC_MINT), isSigner: false, isWritable: false },
    { pubkey: admin.publicKey, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ],
  data,
}));
const sig = await conn.sendTransaction(tx, [admin]);
await conn.confirmTransaction(sig, "confirmed");
console.log("initialized", sig);
console.log("timeouts seconds", ship.toString(), "protection", protection.toString());
