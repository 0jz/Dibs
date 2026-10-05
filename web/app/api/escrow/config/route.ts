import { programId } from "@/lib/escrow/keys";
import { DEVNET_RPC, USDC_MINT } from "@/lib/escrow/math";

export async function GET() {
  const program = programId();
  return Response.json({
    configured: Boolean(program),
    programId: program?.toBase58() ?? null,
    usdcMint: USDC_MINT,
    rpc: process.env.NEXT_PUBLIC_SOLANA_RPC ?? DEVNET_RPC,
    cluster: "devnet",
  });
}
