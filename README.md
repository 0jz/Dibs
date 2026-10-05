# Dibs — Plan A (test while you wait)

*Pivoted 2026-10-05 from "on-chain group buys" to certified used PC hardware. Renamed from Tezga to Dibs on 2026-10-05. Chain: Solana + USDC (the Monad sections below are outdated; see BUILD-PROMPT.md).*

## One-liner

**Dibs is a marketplace for used PC parts you can trust.** A partner repair shop tests the part while the seller waits and signs the report on-chain. The buyer pays into escrow. When the part arrives, a small tool on the buyer's PC confirms it's the same part, and the seller is paid automatically. If it doesn't match, the buyer is protected.

## The problem

Used GPUs and CPUs on KP and Facebook come with fake specs, worn-out ex-mining cards, lower-model swaps and "it worked when I shipped it." Buyers can't verify anything before paying, so they either overpay for risk or don't buy at all.

## How Plan A works

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

## What the store test records

- **Identity:** GPU UUID (`nvidia-smi -L`), VBIOS version, model, VRAM size, the sticker serial (typed in by the store), seal sticker ID
- **Health:** stress test score (e.g. 3DMark / FurMark / OCCT run), peak temperature, hotspot temp, VRAM error test pass/fail, fan check
- **Condition:** photos, notes (repaste, mining history if detectable, damage)
- **On-chain:** the fingerprint checked on delivery (see *Fingerprints* below), the headline numbers, and a link to the full report JSON + photos stored off-chain (IPFS or backend)

## Web app + staff panel (built 2026-10-05) — `web/`

Next.js 16 app plus a Python test agent. Data is stored in `web/data/db.json` (gitignored). No blockchain yet: the "Buy with escrow" button is disabled and "On-chain" shows *pending anchor*.

**Run it**
```
cd web
npm run dev:lan        # serves on port 3000, reachable from other PCs on the LAN
```
- Public site: `http://localhost:3000`
- Staff panel: `http://localhost:3000/admin` (password `dibs`, change it with the `DIBS_ADMIN_PASSWORD` env var; set the shop name with `DIBS_STORE_NAME`)

**Demo flow (you play the shop)**
1. Staff panel → **Start new test** → shows a 6-character code plus the exact command to run
2. On the device being tested: download `http://<server>/dibs_agent.py` and run
   `python dibs_agent.py test --server http://<server-ip>:3000 --code ABC123`
   (`--cpu-seconds 6 --gpu-seconds 15` for a quick demo; the defaults are 15 and 45)
3. The panel updates live: hardware read → CPU benchmark → GPU stress (a browser tab opens with a WebGL load) → review
4. Fill in the review form (what is sold: *graphics card only* or *whole device*, title, grade, seller, price, seal ID, notes) → **Sign & publish** → the listing goes live
5. Buyer check on the delivered device (for a card: installed in the buyer's own PC): `python dibs_agent.py verify --server ... --listing <id>` → Match / Mismatch, shown on the listing

**What the agent records:** system model + BIOS serial, CPU, RAM modules, every NVIDIA GPU (UUID, VBIOS, VRAM), SSD SMART health, laptop battery wear (`powercfg /batteryreport`), CPU single/multi score, and GPU temp/load/power/clock/throttle telemetry sampled every ~2s under load.

**Safe load, not a miner.** Core stress defaults to 45s and is hard-capped at 90s. A second pass stresses VRAM bandwidth for 20s (cap 30s). Both stop if the GPU hits 90°C. No mining program is run: a miner can overheat memory without GeForce `nvidia-smi` showing it. Phones use the same page on the shop Wi-Fi: `/stress?profile=phone&mode=core` (max 20s) and `mode=memory` (max 25s, battery % when the browser reports it).

**Real part scores:** `GET /api/reference?q=RTX%203080` reads medians from the Blender Open Data dump (`opendata-latest.zip`, CC0). Rebuild with `python scripts/build_blender_reference.py`. `GET /api/reference?kind=phone` describes the on-device phone test and points at GreenHub for battery field data. Those numbers are measured; missing models stay missing.

**Fingerprints** (both sha256, 32 bytes, so they fit a `bytes32` on-chain as is):
- **Part** (graphics card only): `sha256({"gpu": "<uuid>|<vbios>"})`, one per GPU. It still matches after the card is moved to the buyer's PC; the verify step passes if *any* GPU in that PC matches.
- **Device** (laptop / prebuilt): `sha256({"bios": <BIOS serial>, "gpus": sorted "<uuid>|<vbios>"})`. The buyer must receive that exact machine.
- The staff picks the kind when publishing (desktops default to *part*, laptops to *device*). Listings created before this existed count as *device*.
- The seal sticker ID is recorded but not part of either hash yet.

**Known quirks**
- Brave/Firefox hide the GPU name in WebGL ("… or similar"). The load graph still shows whether the dedicated GPU did the work.
- On laptops with two GPUs, the browser may render on the integrated GPU → set it to High performance in Windows Graphics settings.
- Windows + NVIDIA only for now. The agent needs Python 3 on the device (package it with PyInstaller later).

**Files:** `web/public/dibs_agent.py` (agent), `web/app/api/*` (agent/session/publish/verify endpoints), `web/components/admin/SessionLive.tsx` (live test view), `web/app/listing/[id]` (public report).

## Smart contracts (Solidity, Foundry, Monad)

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

## Dibs Check (buyer tool)

- A small Python script (or packaged .exe later): reads the GPU UUID + VBIOS via `nvidia-smi`, takes the seal ID from the user, computes `deviceHash`, and opens the web app with the hash ready for the buyer to submit
- Optional quick 30-second load test, shown as "within X% of the store's result"
- **NVIDIA GPUs only for v1**. AMD, CPUs, RAM and SSDs come later.

## Front end (Next.js + wagmi/viem)

1. **Browse**: listing cards with a "Tested at [store]" badge, score, temps, photos
2. **Listing page**: full report, hardware passport history, Buy button
3. **Store dashboard**: enter test results, submit report
4. **My orders**: escrow status timeline (Paid → Shipped → Verified → Paid out)

## Build order (hackathon)

1. **Contracts + tests**: registry, reports, market escrow with MON and mock USDC, timeouts. Deploy to Monad testnet (see the `monad-hackathon` skill).
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
- **Why Monad:** cheap, fast writes for every report and escrow step; fast enough for live auctions later.

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
