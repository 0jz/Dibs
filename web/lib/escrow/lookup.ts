import "server-only";
import type { Listing } from "@/lib/types";
import { connection } from "@/lib/escrow/server";
import { programId } from "@/lib/escrow/keys";
import { decodeListing, escrowId, fmtBase, listingPda, partHashBytes } from "@/lib/escrow/chain";
import { DEVNET_RPC, USDC_MINT } from "@/lib/escrow/math";

/** Shop report plus the Solana listing account. The serial number is not returned. */
export function reportView(listing: Listing) {
  const { biosSerial: _serial, ...system } = listing.identity.system;
  return {
    id: listing.id,
    title: listing.title,
    kind: listing.kind ?? "device",
    price: listing.price,
    currency: listing.currency,
    priceBase: listing.priceBase ?? null,
    sellerWallet: listing.sellerWallet ?? null,
    grade: listing.grade,
    notes: listing.notes,
    sealId: listing.sealId,
    store: listing.store,
    testedAt: listing.testedAt,
    fingerprint: listing.deviceHash,
    reportHash: listing.reportHash,
    hardware: {
      deviceType: listing.identity.deviceType,
      system,
      cpu: listing.identity.cpu,
      ram: listing.identity.ram,
      gpus: listing.identity.gpus,
      disks: listing.identity.disks,
      battery: listing.identity.battery,
      os: listing.identity.os,
    },
    scores: {
      cpu: listing.results.cpu,
      gpu: listing.results.gpu,
      stressFps: listing.gpuScore?.fps ?? null,
      memoryFps: listing.memoryScore?.fps ?? null,
      mining: listing.results.mining ?? null,
    },
    chainReport: listing.chainReport ?? null,
    samples: listing.samples,
  };
}

export async function solanaCheck(listing: Listing) {
  const program = programId();
  const rpc = process.env.NEXT_PUBLIC_SOLANA_RPC ?? DEVNET_RPC;
  const onChainListing = listing.currency === "SOL" || listing.currency === "USDC";
  const base = {
    cluster: "devnet" as const,
    rpc,
    usdcMint: USDC_MINT,
    configured: Boolean(program),
    programId: program?.toBase58() ?? null,
    onChainListing,
    opened: false,
    pda: null as string | null,
    explorer: null as string | null,
    hashMatchesReport: null as boolean | null,
    account: null as null | {
      state: string;
      rail: "sol" | "usdc";
      price: string;
      deposited: string;
      fee: string;
      holdback: string;
      seller: string;
      buyer: string;
      fingerprint: string;
    },
    error: null as string | null,
  };
  if (!program || !onChainListing) return base;

  const pda = listingPda(program, escrowId(listing.id));
  const pdaText = pda.toBase58();
  const explorer = `https://explorer.solana.com/address/${pdaText}?cluster=devnet`;
  try {
    const info = await connection().getAccountInfo(pda);
    if (!info) return { ...base, pda: pdaText, explorer };
    const decoded = decodeListing(Buffer.from(info.data));
    let hashMatchesReport = false;
    try {
      hashMatchesReport = Buffer.compare(decoded.hash, partHashBytes(listing.deviceHash)) === 0;
    } catch {
      hashMatchesReport = false;
    }
    const rail = decoded.rail;
    return {
      ...base,
      opened: true,
      pda: pdaText,
      explorer,
      hashMatchesReport,
      account: {
        state: decoded.state,
        rail,
        price: fmtBase(decoded.price, rail),
        deposited: fmtBase(decoded.deposited, rail),
        fee: fmtBase(decoded.fee, rail),
        holdback: fmtBase(decoded.holdback, rail),
        seller: decoded.seller.toBase58(),
        buyer: decoded.buyer.toBase58(),
        fingerprint: "0x" + Buffer.from(decoded.hash).toString("hex"),
      },
    };
  } catch (error) {
    return {
      ...base,
      pda: pdaText,
      explorer,
      error: error instanceof Error ? error.message : "Solana RPC failed",
    };
  }
}
