# Dibs: pitch and original plan

> **Historical note.** This is the hackathon plan from 2026-10-05, moved out of the README. The project was renamed from Tezga and moved from Monad to **Solana + USDC**. Everything below that mentions Monad, MON, Solidity, Foundry or wagmi/viem is historical and was not built. For what actually exists, see the [README](../README.md); verification and dispute rules are in [ITEM-VERIFICATION.md](../ITEM-VERIFICATION.md).

## One-liner

**Dibs is a marketplace for used PC parts you can trust.** A partner repair shop tests the part while the seller waits and signs the report on-chain. The buyer pays into escrow. When the part arrives, a small tool on the buyer's PC confirms it's the same part, and the seller is paid automatically. If it doesn't match, the buyer is protected.

## The problem

Used GPUs and CPUs on KP and Facebook come with fake specs, worn-out ex-mining cards, lower-model swaps and "it worked when I shipped it." Buyers can't verify anything before paying, so they either overpay for risk or don't buy at all.

## Plan A flow (original diagram, chain column was Monad)

```
SELLER                     PARTNER STORE                 CHAIN (Monad)               BUYER
  |-- brings GPU --------->|                               |                          |
  |                        |-- 20–30 min detailed test     |                          |
  |                        |-- signs report -------------->| TestReport (device hash, |
  |<-- takes GPU back -----|   (+ seal sticker on card)    |  score, temps, photos)   |
  |-- creates listing ------------------------------------>| Listing                  |
  |                                                        |<----- pays into escrow --|
  |-- ships GPU (tracking) ------------------------------->| state: Shipped           |
  |                                                        |                          |-- runs Dibs Check
  |                                                        |<-- device hash matches --|
  |<------------------------- payout (minus fee) ----------| Released                 |
```

The store **never holds stock overnight**, so it carries no theft or storage risk beyond what a repair shop already has.

## Roles

| Role | Does | Gets |
|---|---|---|
| Seller | Brings part to store, lists, ships | Sells faster and for more (certified) |
| Partner store | Runs detailed test, signs report with its wallet, puts on a deposit | Test fee per part (paid in-store, e.g. €10–15), foot traffic |
| Buyer | Pays into escrow, runs Dibs Check on arrival | Money back if the part isn't the one that was tested |
| Dibs | Contracts, marketplace, check tool | % fee on each sale (e.g. 3%) |

## What the store test records (original plan)

- **Identity:** GPU UUID (`nvidia-smi -L`), VBIOS version, model, VRAM size, the sticker serial (typed in by the store), seal sticker ID
- **Health:** stress test score (e.g. 3DMark / FurMark / OCCT run), peak temperature, hotspot temp, VRAM error test pass/fail, fan check
- **Condition:** photos, notes (repaste, mining history if detectable, damage)
- **On-chain:** the fingerprint checked on delivery (see *Fingerprints* in the [README](../README.md#how-it-works)), the headline numbers, and a link to the full report JSON + photos stored off-chain (IPFS or backend)

## Original contract design (Solidity, Monad; historical, not built)

**`StoreRegistry`**
- `registerStore(name, location)` + deposit, approved by the Dibs admin (hackathon: owner-approved)
- Tracks per store: reports issued, disputes lost → shown as public accuracy

**`TestReports`**
- `submitReport(deviceHash, score, maxTemp, vramOk, reportURI)`, which only registered stores can call
- Reports are append-only, so each part builds a **hardware passport** across resales

**`DibsMarket`** (listing + escrow)
- `createListing(reportId, price, token)`, where token is MON or USDC (a mock USDC on testnet)
- `buy(listingId)` → funds held in the contract
- `markShipped(listingId, trackingHash)`
- `confirmMatch(listingId, deviceHash)` from the buyer → if the hash matches the report: pay the seller (minus fee)
- `openDispute(listingId)` → the part goes back to a partner store for re-check; whoever was wrong pays the re-test fee, and a store that certified a bad part loses part of its deposit
- **Timeouts:** seller doesn't ship within X days → buyer refunded; buyer does nothing within Y days of delivery → auto-release to seller

**Important rule:** a buyer can't get a refund by just claiming "mismatch". A mismatch always opens a dispute and requires returning the part to a store. Otherwise buyers could keep the part *and* the money.

## Dibs Check (original buyer-tool plan)

- A small Python script (or packaged .exe later): reads the GPU UUID + VBIOS via `nvidia-smi`, takes the seal ID from the user, computes `deviceHash`, and opens the web app with the hash ready for the buyer to submit
- Optional quick 30-second load test, shown as "within X% of the store's result"
- **NVIDIA GPUs only for v1**. AMD, CPUs, RAM and SSDs come later.

## Original front-end plan (wagmi/viem; historical)

1. **Browse**: listing cards with a "Tested at [store]" badge, score, temps, photos
2. **Listing page**: full report, hardware passport history, Buy button
3. **Store dashboard**: enter test results, submit report
4. **My orders**: escrow status timeline (Paid → Shipped → Verified → Paid out)

## Original build order (Monad era; historical)

1. **Contracts + tests**: registry, reports, market escrow with MON and mock USDC, timeouts. Deploy to Monad testnet.
2. **Store dashboard + report submit** (report JSON stored by the backend or a simple pin)
3. **Listing + buy + shipped flow**
4. **Dibs Check script + confirm page**
5. **Dispute path**: at minimum, mismatch → "Disputed" state (resolution can be admin-only for the demo)
6. **Polish**: escrow timeline UI, hardware passport view

Cut line: steps 1–4 make a complete demo. Steps 5–6 are bonus.

## Demo script (~3 min)

1. The problem: a quick KP screenshot story ("RTX 3080, perfect condition" … turned out to be a mined, throttling card)
2. **Store view:** submit a test report for a GPU, which appears on-chain instantly
3. **Seller** lists it. **Buyer** pays into escrow and sees the money locked.
4. **Happy path:** buyer runs Dibs Check → hash matches → seller paid automatically
5. **Swap attempt:** second listing, the "wrong" GPU arrives → Check shows a mismatch → dispute opens, money stays protected
6. Close: hardware passport + roadmap

## Pitch angle

- "Certified at a partner shop, verified at your door, paid only when it matches."
- **Why blockchain:** a shared, tamper-proof record between stores, sellers and buyers who don't trust each other; escrow nobody can run off with; part history that follows the hardware across resales.
- *(Historical)* **Why Monad:** cheap, fast writes for every report and escrow step; fast enough for live auctions later.

## Competition (researched 2026-10-05)

| Who | Role for us | What they do | What Dibs adds |
|---|---|---|---|
| [Verified by Swappie](https://business.swappie.com/services/p2p-verification) (FI/DE/EE) | **Proof the market exists** for physical testing of second-hand devices | Peer-to-peer phone sales: buyer pays into escrow, the phone goes to a Swappie diagnostics hub for testing, then on to the buyer | PC parts instead of phones; tested at a local shop while the seller waits (no shipping to a hub); fingerprint check at the buyer's door |
| [Jawa.gg](https://www.jawa.gg) (US) | **Niche competitor**: PC parts and whole-PC marketplace | Gaming-hardware marketplace with buyer protection (3–14 day window) and "Verified Sellers" who say they test their builds | Independent shop test instead of the seller's own claim; proof that the delivered part is the one tested |
| [KupujemProdajem](https://www.kupujemprodajem.com) (RS) | **Main broad competitor** in Serbia and the Balkans | The largest classifieds site in Serbia; most used GPUs change hands here. No integrated payment, escrow or buyer protection ([KP blog](https://blog.kupujemprodajem.com/tag/kp-payment/)) | Escrow, signed test report, delivery check. If KP adds escrow, that still doesn't stop part swaps or worn-out ex-mining cards |
| [eShopCrypto](https://vantechjournal.com/p/second-hand-marketplace-eshopcrypto) | Second-hand marketplace **with smart contracts** | Smart-contract escrow until the buyer confirms receipt, plus KYC identity checks | Verifies the hardware itself, not only the users |

**Takeaway:** nobody we found combines a local shop test while the seller waits, escrow, and a check that the delivered part is the one tested, for PC parts or in the Balkans. One line for the pitch: "Swappie-style verification for PC parts, done at your local repair shop."

## Roadmap (slide only)

- Single-item timed auctions (deadline extends on late bids) as a second way to sell
- More part types: CPUs, RAM, SSDs, AMD GPUs
- **Plan B tier:** "Dibs Certified + Shipped", where a trusted store-hub tests and ships high-value parts and sellers far from a store can mail parts in
- Card / fiat on-ramp, other chains for checkout
- Regional expansion: Serbia → ex-YU

## Risks and answers

| Risk | Answer |
|---|---|
| Store rubber-stamps bad parts or colludes with a seller | Store deposit gets slashed on lost disputes, public accuracy record, random re-checks |
| Seller swaps the part after the test | Device hash + seal sticker, checked by the buyer before payout |
| Buyer falsely claims mismatch | Mismatch = dispute + return to store, never an instant refund |
| Damage in shipping | Dispute path; shipping insurance on the roadmap |
| Spoofed check tool output | Hackathon: best-effort; roadmap: signed/attested check |
| Store robbery | Plan A: stores don't hold stock |

## Open questions

- [ ] Hackathon deadline and exact rules — confirm the Colosseum round accepts Monad submissions
- [ ] Team split: who does contracts / front end / check tool
- [ ] Which 1–2 Belgrade repair shops to name as pilot targets
- [ ] Fee levels (test fee, platform %) for the pitch
- [ ] Update the Colosseum project description (draft below)

## Colosseum description (draft v3, 2026-10-05: all hardware)

**One-liner:** Used hardware, tested before you pay.

**Blurb (495 characters, limit 500):**

> Buying used hardware on KupujemProdajem or Facebook means trusting a stranger: worn-out parts, fake specs and swapped devices are common. With Dibs, a partner repair shop tests the GPU, PC, laptop or phone while the seller waits and signs the report on Solana. The buyer pays into USDC escrow, and when it arrives our check confirms it's the exact device tested before the seller is paid. Sellers back their declared history with held-back funds. Every test builds an on-chain hardware passport.

*Previous GPU-only version (v2): "Used GPUs, tested before you pay."*
