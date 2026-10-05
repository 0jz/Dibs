import { PublicKey, Transaction } from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { USDC_MINT } from "./math";

export const mintKey = () => new PublicKey(USDC_MINT);

export function ata(owner: PublicKey) {
  return getAssociatedTokenAddressSync(mintKey(), owner, true);
}

export function ataIx(payer: PublicKey, owner: PublicKey) {
  return createAssociatedTokenAccountIdempotentInstruction(payer, ata(owner), owner, mintKey());
}

export function settleRest(rail: "sol" | "usdc", listing: PublicKey, seller: PublicKey, treasury: PublicKey) {
  if (rail === "sol") {
    return [
      { pubkey: seller, isWritable: true },
      { pubkey: treasury, isWritable: true },
    ];
  }
  return [
    { pubkey: ata(listing), isWritable: true },
    { pubkey: ata(seller), isWritable: true },
    { pubkey: ata(treasury), isWritable: true },
    { pubkey: TOKEN_PROGRAM_ID, isWritable: false },
  ];
}

export function payRest(rail: "sol" | "usdc", listing: PublicKey, dest: PublicKey) {
  if (rail === "sol") return [{ pubkey: dest, isWritable: true }];
  return [
    { pubkey: ata(listing), isWritable: true },
    { pubkey: ata(dest), isWritable: true },
    { pubkey: TOKEN_PROGRAM_ID, isWritable: false },
  ];
}

export function withAtas(tx: Transaction, payer: PublicKey, owners: PublicKey[]) {
  const seen = new Set<string>();
  for (const owner of owners) {
    const key = owner.toBase58();
    if (seen.has(key)) continue;
    seen.add(key);
    tx.add(ataIx(payer, owner));
  }
}

export { TOKEN_PROGRAM_ID };
