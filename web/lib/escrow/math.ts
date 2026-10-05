/** Payout math. Must match `quote` in program/escrow/src/lib.rs. Amounts are base units. */

export function quote(price: bigint, feeBps: number, holdbackBps: number) {
  if (feeBps < 0 || feeBps > 500 || holdbackBps < 500 || holdbackBps > 1500) {
    throw new Error("fee or holdback is outside the program limits");
  }
  const fee = (price * BigInt(feeBps)) / 10_000n;
  const holdback = (price * BigInt(holdbackBps)) / 10_000n;
  const seller = price - fee - holdback;
  if (holdback <= 0n || seller <= 0n) {
    throw new Error("price is too small to hold back a share and still pay the seller");
  }
  return { fee, holdback, seller };
}

export const FEE_BPS = 400;
export const HOLDBACK_BPS = 1000;

/** Circle devnet USDC, 6 decimals. https://developers.circle.com/wallets/tokens */
export const USDC_MINT = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";

export const DEVNET_RPC = "https://api.devnet.solana.com";

export function priceToBase(price: number, currency: "SOL" | "USDC") {
  const scale = currency === "SOL" ? 1_000_000_000 : 1_000_000;
  if (!Number.isFinite(price) || price <= 0) throw new Error("price must be positive");
  const base = BigInt(Math.round(price * scale));
  quote(base, FEE_BPS, HOLDBACK_BPS);
  return base;
}
