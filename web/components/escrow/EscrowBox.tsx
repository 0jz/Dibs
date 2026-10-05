"use client";

import { useCallback, useEffect, useState } from "react";
import { Connection, PublicKey, Transaction } from "@solana/web3.js";
import {
  configPda,
  decodeConfig,
  decodeListing,
  escrowId,
  fmtBase,
  ixAutoRelease,
  ixBuySol,
  ixBuyUsdc,
  ixCancel,
  ixCancelDispute,
  ixClaim,
  ixConfirm,
  ixDispute,
  ixExpireClaim,
  ixExpireDispute,
  ixRefundUnshipped,
  ixRelease,
  ixShip,
  listingPda,
  partHashBytes,
} from "@/lib/escrow/chain";
import { ata, payRest, settleRest, TOKEN_PROGRAM_ID, withAtas } from "@/lib/escrow/pay";

type Phantom = {
  isPhantom?: boolean;
  publicKey?: { toString(): string };
  connect: () => Promise<{ publicKey: { toString(): string } }>;
  signTransaction: (tx: Transaction) => Promise<Transaction>;
};

type Config = { configured: boolean; programId: string | null; rpc: string };
type Chain = ReturnType<typeof decodeListing> | null;
type Limits = ReturnType<typeof decodeConfig> | null;

const ERRORS: Record<string, string> = {
  "0x1": "That action isn't allowed in the current state.",
  "0x2": "The connected wallet isn't allowed to do that.",
  "0x3": "The amount doesn't match the listing.",
  "0x4": "Wrong SOL/USDC accounts.",
  "0x5": "That fingerprint doesn't match the listing.",
  "0x6": "The timeout has not been reached.",
  "0x7": "The price can't cover the fee and holdback.",
};

function explain(error: unknown) {
  const text = error instanceof Error ? error.message : String(error);
  for (const [code, message] of Object.entries(ERRORS)) {
    if (text.includes(code)) return message;
  }
  return text;
}

export function EscrowBox({
  listingId,
  currency,
  sellerWallet,
  priceBase,
  deviceHash,
  verifyMatch,
}: {
  listingId: string;
  currency: string;
  sellerWallet?: string;
  priceBase?: string;
  deviceHash: string;
  verifyMatch: boolean | null;
}) {
  const [config, setConfig] = useState<Config | null>(null);
  const [wallet, setWallet] = useState("");
  const [chain, setChain] = useState<Chain>(null);
  const [limits, setLimits] = useState<Limits>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [sig, setSig] = useState("");
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));

  const onChain = currency === "SOL" || currency === "USDC";
  const rail = currency === "USDC" ? "usdc" : "sol";

  const refresh = useCallback(async (cfg: Config) => {
    if (!cfg.programId) return;
    const program = new PublicKey(cfg.programId);
    const conn = new Connection(cfg.rpc, "confirmed");
    const id = escrowId(listingId);
    const [listingInfo, configInfo] = await Promise.all([
      conn.getAccountInfo(listingPda(program, id)),
      conn.getAccountInfo(configPda(program)),
    ]);
    setChain(listingInfo ? decodeListing(Buffer.from(listingInfo.data)) : null);
    setLimits(configInfo ? decodeConfig(Buffer.from(configInfo.data)) : null);
  }, [listingId]);

  useEffect(() => {
    fetch("/api/escrow/config")
      .then((r) => r.json())
      .then((cfg: Config) => {
        setConfig(cfg);
        return refresh(cfg);
      })
      .catch((e) => setError(explain(e)));
  }, [refresh]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 5000);
    return () => clearInterval(timer);
  }, []);

  async function connect() {
    const phantom = (window as unknown as { solana?: Phantom }).solana;
    if (!phantom?.isPhantom) {
      setError("Install Phantom and switch it to Devnet.");
      return;
    }
    const res = await phantom.connect();
    setWallet(res.publicKey.toString());
  }

  async function send(build: (program: PublicKey, payer: PublicKey, tx: Transaction) => void) {
    if (!config?.programId) return;
    const phantom = (window as unknown as { solana?: Phantom }).solana;
    if (!phantom?.publicKey && !wallet) {
      await connect();
    }
    const payer = new PublicKey(phantom?.publicKey?.toString() || wallet);
    setBusy(true);
    setError("");
    try {
      const program = new PublicKey(config.programId);
      const conn = new Connection(config.rpc, "confirmed");
      const tx = new Transaction();
      build(program, payer, tx);
      const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash();
      tx.feePayer = payer;
      tx.recentBlockhash = blockhash;
      const signed = await phantom!.signTransaction(tx);
      const signature = await conn.sendRawTransaction(signed.serialize());
      await conn.confirmTransaction({ signature, blockhash, lastValidBlockHeight });
      setSig(signature);
      setWallet(payer.toBase58());
      await refresh(config);
    } catch (e) {
      setError(explain(e));
    } finally {
      setBusy(false);
    }
  }

  async function openEscrow() {
    setBusy(true);
    setError("");
    try {
      const phantom = (window as unknown as { solana?: Phantom }).solana;
      if (!phantom?.isPhantom) throw new Error("Install Phantom and switch it to Devnet.");
      const connected = await phantom.connect();
      setWallet(connected.publicKey.toString());
      const res = await fetch("/api/escrow/open", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listingId }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Could not open escrow");
      const tx = Transaction.from(Buffer.from(body.tx, "base64"));
      const signed = await phantom.signTransaction(tx);
      const conn = new Connection(config!.rpc, "confirmed");
      const signature = await conn.sendRawTransaction(signed.serialize());
      await conn.confirmTransaction({ signature, blockhash: body.blockhash, lastValidBlockHeight: body.lastValidBlockHeight });
      setSig(signature);
      await refresh(config!);
    } catch (e) {
      setError(explain(e));
    } finally {
      setBusy(false);
    }
  }

  async function staff(action: string, extra: Record<string, boolean>) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/escrow/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listingId, action, ...extra }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Shop action failed");
      setSig(body.signature);
      if (config) await refresh(config);
    } catch (e) {
      setError(explain(e));
    } finally {
      setBusy(false);
    }
  }

  if (!onChain) {
    return (
      <p className="mt-3 text-xs leading-relaxed text-zinc-500">
        This price is in {currency}. Escrow on devnet takes SOL, with USDC as the other rail. Publish again in SOL or USDC to lock funds.
      </p>
    );
  }

  if (!sellerWallet || !priceBase) {
    return <p className="mt-3 text-xs text-zinc-500">This listing has no seller wallet, so escrow cannot be opened.</p>;
  }

  const me = wallet;
  const isSeller = me === sellerWallet;
  const isBuyer = chain ? me === chain.buyer.toBase58() : false;
  const shipDeadline = chain && limits ? chain.paidAt + limits.shipSecs : 0;
  const confirmDeadline = chain && limits ? chain.shippedAt + limits.confirmSecs : 0;
  const id = escrowId(listingId);
  const programKey = config?.programId ? new PublicKey(config.programId) : null;
  const pda = programKey ? listingPda(programKey, id) : null;

  return (
    <div className="mt-4 space-y-3">
      <p className="text-xs leading-relaxed text-zinc-500">
        {currency === "SOL" ? "Devnet SOL" : "Devnet USDC"} stays in the listing account until you sign. A website Match is not proof the card arrived.
        {verifyMatch === false && " The latest delivery check was a mismatch: open a dispute instead of confirming."}
        {verifyMatch === true && " The latest check matched. You still have to sign the release yourself."}
      </p>
      {!config?.configured && <p className="text-xs text-amber-300">The devnet program is not deployed on this machine yet.</p>}
      {chain && (
        <p className="text-sm text-zinc-200">
          On-chain: <span className="text-amber-200">{chain.state}</span>
          {chain.price > 0n && <span className="text-zinc-400"> · {fmtBase(chain.price, chain.rail)} · holdback {fmtBase(chain.holdback || (chain.price * 1000n) / 10000n, chain.rail)}</span>}
        </p>
      )}
      {!me && config?.configured && (
        <button onClick={connect} className="w-full rounded-lg border border-white/15 py-2 text-sm text-zinc-200 hover:border-white/30">Connect Phantom</button>
      )}
      {config?.configured && !chain && isSeller && (
        <button disabled={busy} onClick={openEscrow} className="w-full rounded-lg bg-amber-400 py-2.5 font-medium text-black disabled:opacity-60">Open escrow</button>
      )}
      {config?.configured && !chain && me && !isSeller && <p className="text-xs text-zinc-500">Waiting for the seller wallet to open escrow.</p>}
      {chain?.state === "active" && me && !isSeller && (
        <button
          disabled={busy}
          onClick={() => send((program, payer, tx) => {
            if (rail === "usdc") {
              const listing = listingPda(program, id);
              withAtas(tx, payer, [payer, listing]);
              tx.add(ixBuyUsdc(program, payer, id, ata(payer), ata(listing), TOKEN_PROGRAM_ID));
            } else {
              tx.add(ixBuySol(program, payer, id));
            }
          })}
          className="w-full rounded-lg bg-amber-400 py-2.5 font-medium text-black disabled:opacity-60"
        >
          Pay {fmtBase(BigInt(priceBase), rail)} into escrow
        </button>
      )}
      {chain?.state === "active" && isSeller && (
        <button disabled={busy} onClick={() => send((program, _payer, tx) => tx.add(ixCancel(program, new PublicKey(sellerWallet), id)))} className="w-full rounded-lg border border-white/15 py-2 text-sm text-zinc-300">Cancel listing</button>
      )}
      {chain?.state === "paid" && isSeller && (
        <button disabled={busy} onClick={() => send((program, _payer, tx) => tx.add(ixShip(program, new PublicKey(sellerWallet), id)))} className="w-full rounded-lg bg-amber-400 py-2.5 font-medium text-black disabled:opacity-60">Mark shipped</button>
      )}
      {chain?.state === "paid" && now >= shipDeadline && (
        <button disabled={busy} onClick={() => send((program, payer, tx) => {
          if (rail === "usdc") withAtas(tx, payer, [chain.buyer]);
          tx.add(ixRefundUnshipped(program, id, payRest(chain.rail, listingPda(program, id), chain.buyer)));
        })} className="w-full rounded-lg border border-white/15 py-2 text-sm text-zinc-200">Refund buyer (ship timeout)</button>
      )}
      {chain?.state === "shipped" && isBuyer && limits && (
        <>
          <button disabled={busy} onClick={() => send((program, payer, tx) => {
            if (rail === "usdc") withAtas(tx, payer, [chain.seller, limits.treasury]);
            tx.add(ixConfirm(program, payer, id, partHashBytes(deviceHash), settleRest(chain.rail, listingPda(program, id), chain.seller, limits.treasury)));
          })} className="w-full rounded-lg bg-amber-400 py-2.5 font-medium text-black disabled:opacity-60">Confirm and release</button>
          <button disabled={busy} onClick={() => send((program, payer, tx) => tx.add(ixDispute(program, payer, id)))} className="w-full rounded-lg border border-red-400/40 py-2 text-sm text-red-300">Open dispute</button>
        </>
      )}
      {chain?.state === "shipped" && now >= confirmDeadline && limits && (
        <button disabled={busy} onClick={() => send((program, payer, tx) => {
          if (rail === "usdc") withAtas(tx, payer, [chain.seller, limits.treasury]);
          tx.add(ixAutoRelease(program, id, settleRest(chain.rail, listingPda(program, id), chain.seller, limits.treasury)));
        })} className="w-full rounded-lg border border-white/15 py-2 text-sm text-zinc-300">Pay seller (confirm timeout)</button>
      )}
      {chain?.state === "disputed" && isBuyer && (
        <button disabled={busy} onClick={() => send((program, payer, tx) => tx.add(ixCancelDispute(program, payer, id)))} className="w-full rounded-lg border border-white/15 py-2 text-sm text-zinc-200">Cancel dispute</button>
      )}
      {chain?.state === "disputed" && chain.from === 2 && now >= chain.since + (limits?.disputeSecs ?? 0) && (
        <button disabled={busy} onClick={() => send((program, payer, tx) => {
          if (rail === "usdc") withAtas(tx, payer, [chain.buyer]);
          tx.add(ixExpireDispute(program, id, payRest(chain.rail, listingPda(program, id), chain.buyer)));
        })} className="w-full rounded-lg border border-white/15 py-2 text-sm text-zinc-200">Refund unshipped dispute</button>
      )}
      {chain?.state === "protection" && isBuyer && !chain.claimUsed && now < chain.protectionEnd && (
        <button disabled={busy} onClick={() => send((program, payer, tx) => tx.add(ixClaim(program, payer, id)))} className="w-full rounded-lg border border-white/15 py-2 text-sm text-zinc-200">Open protection claim</button>
      )}
      {chain?.state === "protection" && now >= chain.protectionEnd && (
        <button disabled={busy} onClick={() => send((program, payer, tx) => {
          if (rail === "usdc") withAtas(tx, payer, [chain.seller]);
          tx.add(ixRelease(program, id, payRest(chain.rail, listingPda(program, id), chain.seller)));
        })} className="w-full rounded-lg bg-amber-400 py-2.5 font-medium text-black disabled:opacity-60">Release holdback</button>
      )}
      {chain?.state === "claimed" && now >= chain.since + (limits?.claimSecs ?? 0) && (
        <button disabled={busy} onClick={() => send((program, _payer, tx) => tx.add(ixExpireClaim(program, id)))} className="w-full rounded-lg border border-white/15 py-2 text-sm text-zinc-200">Expire unanswered claim</button>
      )}
      {(chain?.state === "disputed" || chain?.state === "claimed") && (
        <div className="grid grid-cols-2 gap-2">
          {chain.state === "disputed" ? (
            <>
              <button disabled={busy} onClick={() => staff("resolveDispute", { refundBuyer: true })} className="rounded-lg border border-white/15 py-2 text-xs text-zinc-300">Shop: refund</button>
              <button disabled={busy} onClick={() => staff("resolveDispute", { refundBuyer: false })} className="rounded-lg border border-white/15 py-2 text-xs text-zinc-300">Shop: release</button>
            </>
          ) : (
            <>
              <button disabled={busy} onClick={() => staff("resolveClaim", { approve: true })} className="rounded-lg border border-white/15 py-2 text-xs text-zinc-300">Shop: pay claim</button>
              <button disabled={busy} onClick={() => staff("resolveClaim", { approve: false })} className="rounded-lg border border-white/15 py-2 text-xs text-zinc-300">Shop: reject</button>
            </>
          )}
        </div>
      )}
      {error && <p className="text-xs text-red-400">{error}</p>}
      {sig && pda && (
        <a className="block text-xs text-amber-300 hover:underline" href={`https://explorer.solana.com/tx/${sig}?cluster=devnet`} target="_blank" rel="noreferrer">
          Transaction on devnet explorer
        </a>
      )}
      {pda && (
        <a className="block text-xs text-zinc-500 hover:text-zinc-300" href={`https://explorer.solana.com/address/${pda.toBase58()}?cluster=devnet`} target="_blank" rel="noreferrer">
          Escrow account
        </a>
      )}
    </div>
  );
}
