# Dibs: brief for mentors

*Colosseum Crypto World's Fair · Superteam Balkan · written 2026-10-05*

> **Certified at a partner shop, verified at your door, paid only when it matches.**

Dibs is a marketplace for used PC parts that buyers can trust. A partner repair shop tests the part while the seller waits and signs the test report. The buyer pays into escrow. When the part arrives, a small tool on the buyer's PC confirms it is **the exact part that was tested**, and only then is the seller paid. If it doesn't match, a dispute opens and the buyer's money stays protected.

---

## 1. Why we're building this (founder and market fit)

We're developers who wanted to buy a used GPU and didn't trust any listing. On KupujemProdajem and Facebook you can't tell whether a card:
- was **secretly used for crypto mining** for years (worn memory, fans and thermal paste),
- has **fake specs** (a cheaper model with a flashed BIOS that reports a higher model or more VRAM),
- will be **swapped** for a different or broken card before it's shipped,
- will arrive with "it worked when I shipped it" and no way to get the money back.

So buyers either pay a big premium to a shop for safety, take the risk, or don't buy at all. We have this problem ourselves.

## 2. How it works

```
SELLER                 PARTNER SHOP                   ESCROW (on-chain)          BUYER
  |-- brings GPU ----->|                                |                          |
  |                    |-- ~2 min automated test        |                          |
  |                    |-- signs report --------------->| report + GPU fingerprint |
  |<-- takes GPU back--|                                |                          |
  |-- listing goes live ----------------------------------------------------------->|
  |                                                     |<----- pays into escrow --|
  |-- ships GPU ---------------------------------------------------------------->  |
  |                                                     |       runs Dibs Check --|
  |                                                     |<-- fingerprint matches --|
  |<---------------------- payout (minus fee) ----------| released                 |
```

- **The shop never keeps the part**, so it takes on no theft or storage risk. It's the same bench work a repair shop already does.
- **Fingerprint:** the GPU's unique hardware ID and firmware (VBIOS) version are hashed together. That hash survives a move to another PC but changes if the card is swapped. Laptops and prebuilt PCs also include the BIOS serial.
- **A mismatch never refunds instantly.** It opens a dispute and the part goes back to a shop for a re-check. Otherwise a buyer could keep both the part and the money.

## 3. What already works (live demo)

Built during the hackathon: a Next.js web app plus a Python test agent.

| Feature | Status |
|---|---|
| Staff panel: start a test → 6-character code → run the agent on the device | ✅ |
| Live test: reads the hardware, runs a CPU benchmark and a GPU stress test, with temperature, load, power and throttling graphs | ✅ |
| Records GPU ID, VBIOS, VRAM, SSD health, laptop battery wear | ✅ |
| Review → **Sign & publish** → public listing with the full report | ✅ |
| Buyer **delivery check** → Match / Mismatch shown on the listing | ✅ (tested: same card in a different PC = match, swapped card = mismatch) |
| Escrow payment, wallet connect, disputes | 🔨 Being built this week |
| Public website | 🔨 Currently runs on our laptop |
| Hardware passport (history of tests across resales) | 📋 Planned |

**Demo (about 2 minutes):** start a test on the laptop → mentors watch the live stress graph → publish → open the public listing on a phone → run the delivery check → **Match**.

## 4. What we understand that others don't (insight)

**Escrow alone doesn't fix used hardware.** A buyer protected by escrow can still receive a swapped card or a worn-out mining card and have no proof. Trust needs two things: **an independent test** and **proof that the tested part is the one that arrived**.

We combine the best parts of existing players:

| Player | What they do well | What we take |
|---|---|---|
| **Swappie** (Europe) | Physically tests second-hand phones for private sales | Independent physical testing, done at a local shop instead of a central hub |
| **Jawa.gg** (USA) | A dedicated marketplace for PC parts and gaming PCs | The niche focus on PC hardware |
| **eShopCrypto** | Second-hand marketplace with smart-contract escrow | Crypto escrow, so nobody can run off with the money |
| **KupujemProdajem** (Serbia) | Where most used GPUs in the region are sold | Our users. KP has no payments, escrow or buyer protection |

**Nobody we found combines all three for PC parts, or anywhere in the Balkans:** a shop test, escrow, and a check that the delivered part is the one tested.

Second insight: repair shops already test parts all day. Dibs turns spare bench time into **paid certification work**, with no stock risk for the shop.

## 5. Market

| Level | Reference market | Why it matters |
|---|---|---|
| **Regional (start)** | KupujemProdajem (Serbia), then the ex-Yugoslav classifieds sites | Where we launch. It's big, and buyers have no protection |
| **Europe** | Swappie | Shows people pay for verified second-hand electronics |
| **USA (main reference)** | Jawa.gg, plus eBay's used-GPU market | The proven niche: used PC parts are a big, active market |
| **Global** | Amazon (Renewed / used) | The ceiling: refurbished and used electronics sold worldwide |

> **TODO before the pitch:** replace this with our own measured numbers, e.g. "X used-GPU listings on KP today × average price €Y = €Z a month in Serbia alone". Judges trust numbers we counted more than quoted reports.

## 6. Business model (viability)

- **Flat fee per test**, paid in the shop when the part is certified. The amount and the split between shop and Dibs are still open (e.g. €10–15).
- **Purchase fee of 3–5%** on each sale, taken automatically when escrow releases.
- Example: a €300 card at 4% earns €12 for Dibs from the sale, plus the test fee.
- **Shops** earn per test and get more customers coming in. **Sellers** sell faster and for more with a certified report. **Buyers** pay a small fee instead of risking the whole price.

**Go-to-market:**
1. 2–3 partner repair shops in Belgrade.
2. Sellers already on KP add a "Dibs tested" link to their KP listing, so we use KP's traffic instead of competing with it.
3. Expand across ex-Yugoslavia, then add more part types (CPUs, RAM, SSDs, AMD GPUs).

## 7. Traction (in progress)

Nothing yet. This week's plan:
- **Ask people to use it:** friends, PC communities, KP sellers and buyers. Certify real cards and get feedback.
- **Visit repair shops:** demo the test on their bench, and ask whether they'd join and what they'd charge.
- **Waitlist** on the public site, posted in local PC communities.
- **Short interviews** with used-GPU buyers: "Would you pay X% for a certified, verified card?"

Goal by the deadline: real numbers such as shops interested, cards certified, waitlist signups, and interviews done.

## 8. Hackathon rules: how we comply

**Deadline:** Oct 12, 11:59pm Pacific = **Oct 13, 08:59 Belgrade**. We submit during the day on Oct 12. Demo Day in Belgrade is Oct 13.

**The two disqualification rules:**
1. **One project per team and per person.** Dibs is our only submission.
2. **Disclose earlier work.** The idea came before the hackathon, as an on-chain group-buy concept that we pivoted to certified used hardware on Oct 5. **All Dibs code was written during the hackathon (from Oct 5).** We'll state this in the submission form. Any earlier material we reuse will be listed too.

**Submission checklist:**

| Item | Status |
|---|---|
| Registered on Colosseum, whole team added | ⬜ |
| One-liner + blurb reviewed with Superteam | ⬜ draft above |
| Working blockchain integration: wallet connect + real transactions | 🔨 this week |
| MVP on a public website judges can open | 🔨 this week |
| Public GitHub repo | ⬜ |
| Clear business and revenue model | ✅ section 6 |
| 2–3 min presentation video + demo video (up to 3 min) | ⬜ |
| Pitch deck (link) | ⬜ |
| Project X account, posting progress, following the judges | ⬜ |

**How the judging criteria are covered:**

| Criterion | Our answer | Status |
|---|---|---|
| Founder and market fit | Developers who wanted a used GPU and couldn't trust any listing | ✅ story ready |
| Insight | Escrow isn't enough: test + proof that the tested part arrived | ✅ |
| Product and execution | Working test, report and check flow. Escrow being built | 🔨 |
| Market size | KP → Swappie (EU) → Jawa / eBay (US) → Amazon (global) | 🟡 needs our own numbers |
| Communication | One-liner, two videos, deck | ⬜ this week |
| Viability | Flat test fee + 3–5% purchase fee | ✅ |
| Traction | Asking people and shops to use it | ⬜ this week |
| Novelty (official rules) | Hardware fingerprint check at delivery + on-chain test history | ✅ |
| UX (official rules) | Buyer sees a price, a report and a Match/Mismatch result. Little crypto knowledge needed | 🔨 |
| Open source (official rules) | Public repo | ⬜ |

## 9. Chain decision (we'd like your input)

We originally planned **Monad**. The Colosseum tracks are Solana, Tempo, Hyperliquid, Zcash, Ethereum L1, Base, Arbitrum and Robinhood Chain, so **Monad would only compete for the main awards**. The Colosseum accelerator and the Superteam Balkan local track require Solana. No contract code exists yet, so switching is cheap. **We're leaning towards Solana** (escrow program + Phantom wallet + stablecoin).

## 10. Risks and answers

| Risk | Answer |
|---|---|
| A shop approves bad parts or works with a seller | The shop puts down a deposit and loses part of it on lost disputes. Public accuracy record per shop. Random re-checks |
| The seller swaps the part after the test | The fingerprint check before payout. Seal sticker on the card |
| The buyer falsely claims a mismatch | A mismatch opens a dispute and the part goes back to a shop, never an instant refund |
| Damage in shipping | Dispute path. Shipping insurance on the roadmap |
| A faked check-tool result | Best effort for the hackathon. A signed check on the roadmap |
| Only NVIDIA on Windows for now | AMD, CPUs, RAM and SSDs on the roadmap |

## 11. Questions for mentors

1. **Is blockchain justified here, or would a normal escrow service be enough?** Our answer: a tamper-proof record shared by shops, sellers and buyers who don't trust each other, escrow nobody controls, and a test history that follows the card across resales.
2. **Solana vs. Monad:** is switching to Solana the right call this late?
3. **Wallets:** should buyers connect a real wallet (Phantom), or should we hide crypto completely behind a backend?
4. **Scope:** is GPU-only for v1 convincing, or too narrow?
5. **Fees:** do a flat test fee plus 3–5% sound right? How should the test fee be split with shops?
6. **Traction:** what's the most convincing proof we can get in one week, a shop partnership or real users?
7. **Weakest point:** which risk would a judge attack first?

## 12. This week

| Day | Product | Proof and pitch |
|---|---|---|
| Oct 5 | GitHub repo, chain decision | X account, register the project on Colosseum |
| Oct 6 | Escrow program | Count KP listings for the market size, contact buyers and sellers |
| Oct 7 | Wallet connect + buy / release flow | Visit repair shops with the demo |
| Oct 8 | Public deploy + waitlist | Share the link in PC communities, run a pilot test |
| Oct 9 | Dispute state, polish | One-liner, blurb and deck → Superteam review |
| Oct 10 | Bug fixes only | Record both videos |
| Oct 11 | Feature freeze | Fill in the submission form (incl. earlier work) |
| Oct 12 | — | **Submit**, then test every link in a private window |
| Oct 13 | — | Demo Day, Belgrade |
