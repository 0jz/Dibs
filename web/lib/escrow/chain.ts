import { PublicKey, SystemProgram, TransactionInstruction } from "@solana/web3.js";
import { sha256 } from "@noble/hashes/sha256";
import { FEE_BPS, HOLDBACK_BPS, USDC_MINT } from "./math";

export { FEE_BPS, HOLDBACK_BPS, USDC_MINT };

export const STATE = ["empty", "active", "paid", "shipped", "protection", "disputed", "claimed", "closed", "cancelled", "refunded"] as const;

const L = { state: 0, rail: 1, from: 2, claimUsed: 4, holdbackBps: 6, seller: 8, buyer: 40, hash: 72, price: 104, deposited: 112, fee: 120, holdback: 128, paid: 136, shipped: 144, protect: 152, since: 160, id: 168 };
const C = { init: 0, fee: 2, admin: 4, mint: 36, treasury: 68, ship: 100, confirm: 108, protect: 116, dispute: 124, claim: 132 };

export function escrowId(listingId: string) {
  const digest = sha256(new TextEncoder().encode(listingId));
  return new DataView(digest.buffer, digest.byteOffset, digest.byteLength).getBigUint64(0, true);
}

export function configPda(programId: PublicKey) {
  return PublicKey.findProgramAddressSync([Buffer.from("config")], programId)[0];
}

export function listingPda(programId: PublicKey, id: bigint) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(id);
  return PublicKey.findProgramAddressSync([Buffer.from("listing"), buf], programId)[0];
}

function idBuf(id: bigint) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(id);
  return buf;
}

function u16(n: number) {
  const buf = Buffer.alloc(2);
  buf.writeUInt16LE(n);
  return buf;
}

function u64(n: bigint) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(n);
  return buf;
}

export function partHashBytes(hex: string) {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (!/^[0-9a-fA-F]{64}$/.test(clean)) throw new Error("part hash must be 32 bytes");
  return Buffer.from(clean, "hex");
}

function ix(programId: PublicKey, keys: { pubkey: PublicKey; isSigner: boolean; isWritable: boolean }[], data: Buffer) {
  return new TransactionInstruction({ programId, keys, data });
}

export function ixInit(
  programId: PublicKey,
  payer: PublicKey,
  mint: PublicKey,
  treasury: PublicKey,
  feeBps: number,
  timeouts: bigint[],
) {
  const data = Buffer.concat([Buffer.from([0]), u16(feeBps), ...timeouts.map(u64)]);
  return ix(programId, [
    { pubkey: payer, isSigner: true, isWritable: true },
    { pubkey: configPda(programId), isSigner: false, isWritable: true },
    { pubkey: mint, isSigner: false, isWritable: false },
    { pubkey: treasury, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ], data);
}

export function ixCreate(programId: PublicKey, seller: PublicKey, admin: PublicKey, id: bigint, price: bigint, hash: Buffer, rail: 0 | 1) {
  const data = Buffer.concat([Buffer.from([1]), idBuf(id), u64(price), u16(HOLDBACK_BPS), Buffer.from([rail]), hash]);
  return ix(programId, [
    { pubkey: seller, isSigner: true, isWritable: true },
    { pubkey: admin, isSigner: true, isWritable: false },
    { pubkey: configPda(programId), isSigner: false, isWritable: false },
    { pubkey: listingPda(programId, id), isSigner: false, isWritable: true },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ], data);
}

export function ixBuySol(programId: PublicKey, buyer: PublicKey, id: bigint) {
  return ix(programId, [
    { pubkey: buyer, isSigner: true, isWritable: true },
    { pubkey: configPda(programId), isSigner: false, isWritable: false },
    { pubkey: listingPda(programId, id), isSigner: false, isWritable: true },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ], Buffer.concat([Buffer.from([2]), idBuf(id)]));
}

export function ixBuyUsdc(programId: PublicKey, buyer: PublicKey, id: bigint, buyerAta: PublicKey, vault: PublicKey, tokenProgram: PublicKey) {
  return ix(programId, [
    { pubkey: buyer, isSigner: true, isWritable: true },
    { pubkey: configPda(programId), isSigner: false, isWritable: false },
    { pubkey: listingPda(programId, id), isSigner: false, isWritable: true },
    { pubkey: buyerAta, isSigner: false, isWritable: true },
    { pubkey: vault, isSigner: false, isWritable: true },
    { pubkey: tokenProgram, isSigner: false, isWritable: false },
  ], Buffer.concat([Buffer.from([2]), idBuf(id)]));
}

function tail(programId: PublicKey, tag: number, id: bigint, signer: PublicKey | null, listingWritable = true) {
  const keys = [];
  if (signer) keys.push({ pubkey: signer, isSigner: true, isWritable: false });
  keys.push({ pubkey: listingPda(programId, id), isSigner: false, isWritable: listingWritable });
  return ix(programId, keys, Buffer.concat([Buffer.from([tag]), idBuf(id)]));
}

export function ixShip(programId: PublicKey, seller: PublicKey, id: bigint) {
  return tail(programId, 3, id, seller);
}

export function ixConfirm(programId: PublicKey, buyer: PublicKey, id: bigint, hash: Buffer, rest: { pubkey: PublicKey; isWritable: boolean }[]) {
  const data = Buffer.concat([Buffer.from([4]), idBuf(id), hash]);
  return ix(programId, [
    { pubkey: buyer, isSigner: true, isWritable: false },
    { pubkey: configPda(programId), isSigner: false, isWritable: false },
    { pubkey: listingPda(programId, id), isSigner: false, isWritable: true },
    ...rest.map((a) => ({ ...a, isSigner: false })),
  ], data);
}

export function ixDispute(programId: PublicKey, buyer: PublicKey, id: bigint) {
  return tail(programId, 5, id, buyer);
}

export function ixCancelDispute(programId: PublicKey, buyer: PublicKey, id: bigint) {
  return tail(programId, 7, id, buyer);
}

export function ixCancel(programId: PublicKey, seller: PublicKey, id: bigint) {
  return tail(programId, 15, id, seller);
}

export function ixTimed(programId: PublicKey, tag: number, id: bigint, rest: { pubkey: PublicKey; isWritable: boolean }[]) {
  return ix(programId, [
    { pubkey: configPda(programId), isSigner: false, isWritable: false },
    { pubkey: listingPda(programId, id), isSigner: false, isWritable: true },
    ...rest.map((a) => ({ ...a, isSigner: false })),
  ], Buffer.concat([Buffer.from([tag]), idBuf(id)]));
}

export function ixClaim(programId: PublicKey, buyer: PublicKey, id: bigint) {
  return tail(programId, 9, id, buyer);
}

export function ixExpireDispute(programId: PublicKey, id: bigint, rest: { pubkey: PublicKey; isWritable: boolean }[]) {
  return ixTimed(programId, 8, id, rest);
}

export function ixExpireClaim(programId: PublicKey, id: bigint) {
  return ixTimed(programId, 11, id, []);
}

export function ixRelease(programId: PublicKey, id: bigint, rest: { pubkey: PublicKey; isWritable: boolean }[]) {
  return ixTimed(programId, 12, id, rest);
}

export function ixRefundUnshipped(programId: PublicKey, id: bigint, rest: { pubkey: PublicKey; isWritable: boolean }[]) {
  return ixTimed(programId, 13, id, rest);
}

export function ixAutoRelease(programId: PublicKey, id: bigint, rest: { pubkey: PublicKey; isWritable: boolean }[]) {
  return ixTimed(programId, 14, id, rest);
}

export function ixAdmin(programId: PublicKey, admin: PublicKey, tag: number, id: bigint, flag: number, rest: { pubkey: PublicKey; isWritable: boolean }[]) {
  return ix(programId, [
    { pubkey: admin, isSigner: true, isWritable: true },
    { pubkey: configPda(programId), isSigner: false, isWritable: false },
    { pubkey: listingPda(programId, id), isSigner: false, isWritable: true },
    ...rest.map((a) => ({ ...a, isSigner: false })),
  ], Buffer.concat([Buffer.from([tag]), idBuf(id), Buffer.from([flag])]));
}

function keyAt(data: Buffer, at: number) {
  return new PublicKey(data.subarray(at, at + 32));
}

export function decodeListing(data: Buffer) {
  return {
    state: STATE[data[L.state]] ?? "empty",
    stateCode: data[L.state],
    rail: data[L.rail] === 1 ? "usdc" as const : "sol" as const,
    from: data[L.from],
    claimUsed: data[L.claimUsed] === 1,
    holdbackBps: data.readUInt16LE(L.holdbackBps),
    seller: keyAt(data, L.seller),
    buyer: keyAt(data, L.buyer),
    hash: data.subarray(L.hash, L.hash + 32),
    price: data.readBigUInt64LE(L.price),
    deposited: data.readBigUInt64LE(L.deposited),
    fee: data.readBigUInt64LE(L.fee),
    holdback: data.readBigUInt64LE(L.holdback),
    paidAt: Number(data.readBigInt64LE(L.paid)),
    shippedAt: Number(data.readBigInt64LE(L.shipped)),
    protectionEnd: Number(data.readBigInt64LE(L.protect)),
    since: Number(data.readBigInt64LE(L.since)),
  };
}

export function decodeConfig(data: Buffer) {
  return {
    ready: data[C.init] === 1,
    feeBps: data.readUInt16LE(C.fee),
    admin: keyAt(data, C.admin),
    mint: keyAt(data, C.mint),
    treasury: keyAt(data, C.treasury),
    shipSecs: Number(data.readBigUInt64LE(C.ship)),
    confirmSecs: Number(data.readBigUInt64LE(C.confirm)),
    protectionSecs: Number(data.readBigUInt64LE(C.protect)),
    disputeSecs: Number(data.readBigUInt64LE(C.dispute)),
    claimSecs: Number(data.readBigUInt64LE(C.claim)),
  };
}

export function fmtBase(amount: bigint, rail: "sol" | "usdc") {
  const scale = rail === "sol" ? 1_000_000_000n : 1_000_000n;
  const whole = amount / scale;
  const frac = (amount % scale).toString().padStart(rail === "sol" ? 9 : 6, "0").replace(/0+$/, "");
  const unit = rail === "sol" ? "SOL" : "USDC";
  return frac ? `${whole}.${frac} ${unit}` : `${whole} ${unit}`;
}
