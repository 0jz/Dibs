import type { ListingKind, SaleScope, StressTierId } from "@/lib/types";
import { SCOPE_INFO } from "@/lib/format";
import { BURN_IN_NOTE, STRESS_TIERS, isStressTier } from "@/lib/tests";

export function CheckPlan({
  kind = "device",
  saleScope,
  stressTier = null,
}: {
  kind?: ListingKind;
  saleScope?: SaleScope;
  stressTier?: StressTierId | null;
}) {
  const scope = saleScope ?? (kind === "part" ? "gpu" : "device");
  const info = SCOPE_INFO[scope];
  const subject = scope === "device" ? "the laptop or PC" : info.label.toLowerCase();
  const fingerprint = info.fingerprint;
  return (
    <section className="mt-8 rounded-2xl border border-white/8 bg-white/[0.02] p-5">
      <h2 className="text-lg font-semibold text-zinc-100">What this report is</h2>
      <p className="mt-2 text-sm leading-relaxed text-zinc-400">
        The shop tests {subject} while the seller waits. The page below is that test. Solana stores the fingerprint and the payment, not the owner&apos;s name or the raw serial.
      </p>
      <ol className="mt-4 space-y-3 text-sm leading-relaxed text-zinc-300">
        <li>
          <span className="text-amber-200">1. Identity.</span> The fingerprint is sha256 of {fingerprint}. A part listing still matches after that part moves to another PC. A whole-PC listing has to be the same machine.
          {info.weaker && " This id is weaker than a GPU UUID. Windows can hide it or reuse it."}
        </li>
        <li>
          <span className="text-amber-200">2. Load.</span>{" "}
          {isStressTier(stressTier)
            ? `${STRESS_TIERS[stressTier].summary} ${STRESS_TIERS[stressTier].doesNotProve} ${BURN_IN_NOTE}`
            : `The shop records the stress tier. Light is a short check and is not a certification. ${BURN_IN_NOTE}`}{" "}
          There is no miner.
        </li>
        <li>
          <span className="text-amber-200">3. Comparison.</span> On Standard and Bench the shop runs the official Blender junkshop scene (Cycles CUDA for the graphics card, Cycles CPU for the processor). The percent is this shop&apos;s junkshop samples per minute against the Blender Open Data median for the same model, API and Blender version. Over 100% means faster than the crowd. Below the 10th percentile is flagged as below the normal range. The bars are that community spread. Light does not run junkshop. Temperature stops follow the card&apos;s own slowdown reading when the driver reports it, then a per-model table, not one limit for every GPU.
        </li>
        <li>
          <span className="text-amber-200">4. Payment.</span> SOL is the devnet rail. USDC is the other rail. The buyer pays the exact base units. The shop fee is 4% and 10% stays held back. The buyer has to sign the release after it is marked shipped. A Match on this website does not move the money.
        </li>
      </ol>
    </section>
  );
}
