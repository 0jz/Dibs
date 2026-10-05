/**
 * Deploy dibs_escrow.so to devnet and init it.
 * The .so comes from the GitHub Action (this machine has no Rust).
 *
 *   node web/scripts/devnet.mjs
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Connection, Keypair, PublicKey, SystemProgram, SYSVAR_CLOCK_PUBKEY, SYSVAR_RENT_PUBKEY, Transaction, TransactionInstruction } from "@solana/web3.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");
const keys = path.join(root, "keypairs");
const elfPath = path.join(root, "program", "escrow", "target", "deploy", "dibs_escrow.so");
const USDC_MINT = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
const LOADER = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");
const CHUNK = 900;
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

const elf = readFileSync(elfPath);
const bufferRent = await conn.getMinimumBalanceForRentExemption(37 + elf.length);
const dataRent = await conn.getMinimumBalanceForRentExemption(45 + elf.length);
const programRent = await conn.getMinimumBalanceForRentExemption(36);
const need = bufferRent + dataRent + programRent + 80_000_000;

console.log("admin", admin.publicKey.toBase58());
console.log("program", program.publicKey.toBase58());
for (let i = 0; i < 4; i++) {
  const bal = await conn.getBalance(admin.publicKey);
  if (bal >= need) break;
  await airdrop(admin.publicKey);
}
const bal = await conn.getBalance(admin.publicKey);
if (bal < need) {
  console.error("Need", need, "lamports to deploy. Balance:", bal);
  process.exit(1);
}

async function send(tx, signers) {
  const sig = await conn.sendTransaction(tx, signers, { skipPreflight: false });
  await conn.confirmTransaction(sig, "confirmed");
  return sig;
}

const existing = await conn.getAccountInfo(program.publicKey);
if (existing?.executable) {
  console.log("program already deployed");
} else {
  const buffer = Keypair.generate();
  console.log("deploying", elf.length, "bytes via the upgradeable loader");
  const create = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: admin.publicKey,
      newAccountPubkey: buffer.publicKey,
      lamports: bufferRent,
      space: 37 + elf.length,
      programId: LOADER,
    }),
    new TransactionInstruction({
      programId: LOADER,
      keys: [
        { pubkey: buffer.publicKey, isSigner: false, isWritable: true },
        { pubkey: admin.publicKey, isSigner: false, isWritable: false },
      ],
      data: Buffer.from([0, 0, 0, 0]),
    }),
  );
  await send(create, [admin, buffer]);

  for (let offset = 0; offset < elf.length; offset += CHUNK) {
    const bytes = elf.subarray(offset, offset + CHUNK);
    const data = Buffer.alloc(16 + bytes.length);
    data.writeUInt32LE(1, 0);
    data.writeUInt32LE(offset, 4);
    data.writeBigUInt64LE(BigInt(bytes.length), 8);
    bytes.copy(data, 16);
    const tx = new Transaction().add(new TransactionInstruction({
      programId: LOADER,
      keys: [
        { pubkey: buffer.publicKey, isSigner: false, isWritable: true },
        { pubkey: admin.publicKey, isSigner: true, isWritable: false },
      ],
      data,
    }));
    await send(tx, [admin]);
    if (offset % (CHUNK * 20) === 0) console.log("wrote", offset, "/", elf.length);
  }

  const [programData] = PublicKey.findProgramAddressSync([program.publicKey.toBuffer()], LOADER);
  const max = Buffer.alloc(12);
  max.writeUInt32LE(2, 0);
  max.writeUInt32LE(elf.length, 4);
  const deploy = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: admin.publicKey,
      newAccountPubkey: program.publicKey,
      lamports: programRent,
      space: 36,
      programId: LOADER,
    }),
    new TransactionInstruction({
      programId: LOADER,
      keys: [
        { pubkey: admin.publicKey, isSigner: true, isWritable: true },
        { pubkey: programData, isSigner: false, isWritable: true },
        { pubkey: program.publicKey, isSigner: false, isWritable: true },
        { pubkey: buffer.publicKey, isSigner: false, isWritable: true },
        { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
        { pubkey: SYSVAR_CLOCK_PUBKEY, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: admin.publicKey, isSigner: true, isWritable: false },
      ],
      data: max,
    }),
  );
  await send(deploy, [admin, program]);
  console.log("deployed");
}
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
