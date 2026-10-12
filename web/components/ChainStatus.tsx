import type { solanaCheck } from "@/lib/escrow/lookup";

type Check = Awaited<ReturnType<typeof solanaCheck>>;

export function ChainStatus({ check, reportSig }: { check: Check; reportSig?: string }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-5 text-sm">
      <h3 className="font-semibold text-zinc-100">Solana check</h3>
      {!check.onChainListing && (
        <p className="mt-2 text-zinc-400">This price is not an escrow. Publish it again in SOL or USDC to write the fingerprint on devnet.</p>
      )}
      {check.onChainListing && !check.configured && (
        <p className="mt-2 text-amber-300">The program id is not on this machine, so the chain account cannot be read.</p>
      )}
      {check.onChainListing && check.configured && !check.opened && (
        <p className="mt-2 text-zinc-400">Escrow is not opened yet. The shop report is already available from the listings API. Opening escrow writes the fingerprint into the listing account.</p>
      )}
      {check.account && (
        <dl className="mt-3 space-y-2">
          <div className="flex justify-between gap-3"><dt className="text-zinc-500">State</dt><dd className="text-amber-200">{check.account.state}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-zinc-500">Locked price</dt><dd className="text-zinc-200">{check.account.price}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-zinc-500">In the account</dt><dd className="text-zinc-200">{check.account.deposited}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-zinc-500">Fingerprint</dt><dd className={check.hashMatchesReport ? "text-emerald-300" : "text-red-400"}>{check.hashMatchesReport ? "Matches this report" : "Does not match"}</dd></div>
        </dl>
      )}
      {reportSig && (
        <a href={`https://explorer.solana.com/tx/${reportSig}?cluster=devnet`} className="mt-3 block text-xs text-amber-300 hover:underline" target="_blank" rel="noreferrer">
          Report memo on explorer
        </a>
      )}
      {check.explorer && (
        <a href={check.explorer} className="mt-3 inline-block text-xs text-amber-300 hover:underline" target="_blank" rel="noreferrer">
          Listing account on explorer
        </a>
      )}
      {check.error && <p className="mt-2 text-xs text-red-400">{check.error}</p>}
    </div>
  );
}
