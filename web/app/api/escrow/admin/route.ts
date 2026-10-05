import { Transaction } from "@solana/web3.js";
import { requireStaff } from "@/lib/auth";
import { configPda, decodeConfig, decodeListing, escrowId, ixAdmin, listingPda } from "@/lib/escrow/chain";
import { adminKeypair, programId } from "@/lib/escrow/keys";
import { payRest, settleRest, withAtas } from "@/lib/escrow/pay";
import { connection } from "@/lib/escrow/server";

export async function POST(request: Request) {
  const denied = await requireStaff();
  if (denied) return denied;
  const body = await request.json().catch(() => ({}));
  const listingId = String(body.listingId ?? "");
  const action = String(body.action ?? "");
  const program = programId();
  const admin = adminKeypair();
  if (!program || !admin) return Response.json({ error: "Escrow program is not deployed" }, { status: 503 });
  if (!listingId) return Response.json({ error: "listingId is required" }, { status: 400 });

  const id = escrowId(listingId);
  const conn = connection();
  const listingKey = listingPda(program, id);
  const listingInfo = await conn.getAccountInfo(listingKey);
  const configInfo = await conn.getAccountInfo(configPda(program));
  if (!listingInfo || !configInfo) return Response.json({ error: "Escrow account not found" }, { status: 404 });
  const listing = decodeListing(Buffer.from(listingInfo.data));
  const config = decodeConfig(Buffer.from(configInfo.data));
  if (!config.admin.equals(admin.publicKey)) {
    return Response.json({ error: "This key is not the escrow admin" }, { status: 400 });
  }

  const tx = new Transaction();
  if (listing.rail === "usdc") withAtas(tx, admin.publicKey, [listing.seller, listing.buyer, config.treasury, listingKey]);

  if (action === "resolveDispute") {
    const refund = Boolean(body.refundBuyer);
    const rest = refund ? payRest(listing.rail, listingKey, listing.buyer) : settleRest(listing.rail, listingKey, listing.seller, config.treasury);
    tx.add(ixAdmin(program, admin.publicKey, 6, id, refund ? 1 : 0, rest));
  } else if (action === "resolveClaim") {
    const approve = Boolean(body.approve);
    const rest = approve ? payRest(listing.rail, listingKey, listing.buyer) : [];
    tx.add(ixAdmin(program, admin.publicKey, 10, id, approve ? 1 : 0, rest));
  } else {
    return Response.json({ error: "unknown action" }, { status: 400 });
  }

  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash();
  tx.feePayer = admin.publicKey;
  tx.recentBlockhash = blockhash;
  tx.sign(admin);
  const sig = await conn.sendRawTransaction(tx.serialize());
  await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight });
  return Response.json({ ok: true, signature: sig });
}
