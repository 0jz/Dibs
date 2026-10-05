import { Connection, PublicKey, Transaction } from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { adminKeypair, programId } from "@/lib/escrow/keys";
import { DEVNET_RPC, USDC_MINT } from "@/lib/escrow/math";
import { configPda, escrowId, ixCreate, listingPda, partHashBytes } from "@/lib/escrow/chain";
import { readDb } from "@/lib/db";

export const connection = () => new Connection(process.env.NEXT_PUBLIC_SOLANA_RPC ?? DEVNET_RPC, "confirmed");

export function listingEscrow(listingId: string) {
  const program = programId();
  const admin = adminKeypair();
  const listing = readDb().listings.find((l) => l.id === listingId);
  if (!program || !admin) return { error: "Escrow program is not deployed on this machine yet", status: 503 as const };
  if (!listing) return { error: "Listing not found", status: 404 as const };
  if ((listing.currency !== "SOL" && listing.currency !== "USDC") || !listing.sellerWallet || !listing.priceBase) {
    return { error: "This listing is not an on-chain escrow", status: 400 as const };
  }
  return { program, admin, listing };
}

export function payerAtas(payer: PublicKey, owner: PublicKey, mint: PublicKey) {
  const ata = getAssociatedTokenAddressSync(mint, owner, true);
  return createAssociatedTokenAccountIdempotentInstruction(payer, ata, owner, mint);
}

export async function openTransaction(listingId: string) {
  const loaded = listingEscrow(listingId);
  if ("error" in loaded) return loaded;
  const { program, admin, listing } = loaded;
  const seller = new PublicKey(listing.sellerWallet!);
  const id = escrowId(listing.id);
  const hash = partHashBytes(listing.deviceHash);
  const rail = listing.currency === "USDC" ? 1 : 0;
  const tx = new Transaction().add(ixCreate(program, seller, admin.publicKey, id, BigInt(listing.priceBase!), hash, rail));
  const conn = connection();
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash();
  tx.feePayer = seller;
  tx.recentBlockhash = blockhash;
  tx.partialSign(admin);
  return {
    tx: tx.serialize({ requireAllSignatures: false }).toString("base64"),
    lastValidBlockHeight,
    blockhash,
    escrow: id.toString(),
    pda: listingPda(program, id).toBase58(),
    config: configPda(program).toBase58(),
  };
}

export { TOKEN_PROGRAM_ID, USDC_MINT };
