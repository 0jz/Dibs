import { quote } from "./math";

const cases: [bigint, number, number, bigint, bigint, bigint][] = [
  [300_000_000n, 400, 1000, 12_000_000n, 30_000_000n, 258_000_000n],
  [1_000_000_000n, 400, 1500, 40_000_000n, 150_000_000n, 810_000_000n],
];

for (const [price, feeBps, holdBps, fee, holdback, seller] of cases) {
  const got = quote(price, feeBps, holdBps);
  if (got.fee !== fee || got.holdback !== holdback || got.seller !== seller) {
    throw new Error(`quote mismatch for ${price}`);
  }
}

let threw = false;
try {
  quote(1n, 400, 1000);
} catch {
  threw = true;
}
if (!threw) throw new Error("dust price should fail");

console.log("escrow math ok");
