# Dibs: item verification and security

*Everything we worked out about how to prove a used GPU's identity and condition, what can't be proven, and how money and rules cover the gap. Written 2026-10-05.*

**Stage tags:** 🟢 **Demo** (hackathon, by Oct 12) · 🔵 **Business** (first 1–3 shops in Serbia, real money) · 🟣 **Scale** (more shops, the region, the EU)

---

## 1. Principles

1. **Measure wear, not history.** A GPU keeps no record of how it was used. What a buyer needs to know is whether it will keep working, and that can be measured.
2. **Test on the shop's bench, never the seller's PC.** Otherwise the seller controls the software and can fake the results.
3. **Be clear about limits.** Every report lists what was tested **and what wasn't**.
4. **Money covers what tests can't.** Protection periods and held-back payment cover the risks no test can measure.
5. **Hashes on-chain, personal data off-chain.** A blockchain can't delete anything, and the EU DPP rules forbid storing personal customer data in a product passport.

---

## 2. Identity: is it the same card?

| Item | How | Stage |
|---|---|---|
| **Part fingerprint** (GPU sold alone) | `sha256({"gpu": "<uuid>|<vbios>"})`. Still matches after the card moves to the buyer's PC | 🟢 built |
| **Device fingerprint** (laptop or prebuilt) | `sha256({"bios": serial, "gpus": [...]})`. The exact machine | 🟢 built |
| **Delivery check** | The buyer runs the agent. A card listing matches if **any** GPU in the buyer's PC has the card's fingerprint | 🟢 built |
| **Seal sticker** | A numbered tamper-evident sticker. ID recorded in the report and photographed | 🟢 field exists · 🔵 real stickers |
| **Sticker serial vs. reported serial** | Compare where the card reports a serial (many GeForce cards don't) | 🔵 |
| **Chip swap across resales** | Same sticker serial but a different GPU UUID in a later test means a swapped chip | 🟣 (needs history) |
| **Fake or relabeled card** | The device ID and name don't match the measured performance or hashrate for that model | 🟢 (benchmark) · 🔵 reference table |

---

## 3. Mining and AI history: what's possible

**Searching the blockchain doesn't work.** Proof-of-work output is identical whatever hardware computed it, and blocks record only a wallet, never a card ID. Pool payouts are one combined payment per wallet. Most GPU mining ended with the Ethereum Merge in Sept 2022. The card itself stores nothing (VRAM is wiped at power-off, and there's no usage counter).

**The theoretical chain from card to block:**
`GPU UUID → rig software (HiveOS, logs) → GPU slot → pool worker → extranonce in the block's nonce → block`.
Only the last link is public. The rest is held by the seller (rig data) or the pool (private, and mostly deleted since 2022). Nonce-pattern research works only on **network-wide statistics**, never for one device.

**The wallet address** can only be found on the rig's drive: HiveOS `wallet.conf`, miner `.bat`/`config.json` files, logs, browser history, or deleted files. From an address, public data shows pool payouts, which give an estimate of rig size and months mined. It still never proves which card was in the rig. **Only with the seller's consent** (GDPR).

**AI use** wears a card like mining or worse, with extra **core** wear from training and 24/7 GPU rental (vast.ai, Salad, io.net, Nosana). Chat inference is light, similar to gaming. GPU rental networks register host hardware (Nosana is on Solana), so a host's history can be shown **if they opt in**.

**Signals to use:**

| Signal | Stage |
|---|---|
| Non-LHR version (PCI device ID) + production date in the boom era | 🟢 small lookup table |
| Popular mining/AI models (24 GB cards are AI favourites) | 🟢 |
| VBIOS vs. stock versions for the model | 🔵 hand-made list → 🟣 database |
| PC leftovers (whole-device tests only, **with consent**): Defender `CoinMiner` detections, prefetch/Amcache for miner executables, large page file, `TdrDelay`, Afterburner profiles; AI: Ollama/LM Studio models, Hugging Face cache, ComfyUI, rental clients | 🔵 |
| Batch detection: consecutive serials, the same model, VBIOS and memory vendor from "different" sellers, one seller with many cards | 🟣 (needs volume) |
| Optional **disclosure**: the seller links a pool or rental-network account and Dibs shows "mined ~16 months, 8-card rig" | 🟣 (🟢 mockup only) |

---

## 4. Bench tests (on the shop's own PC)

| Test | Finds | Stage |
|---|---|---|
| Hardware read (GPU, VBIOS, VRAM, CPU, RAM, disks, battery) | Identity and specs | 🟢 built |
| CPU benchmark + GPU stress with telemetry (temp, load, power, clock, throttling) | Thermals, throttling | 🟢 built |
| **PCIe link width/gen (current vs. max) + retransmission counter** (`nvidia-smi -q`) | Damaged connector traces or joints | 🟢 |
| **NVIDIA driver errors in the Windows event log** during the test | Crashes and resets under load | 🟢 |
| **VRAM error test** (memtest_vulkan), run while the card is hot | Worn memory, the main mining damage | 🟢 if the binary is present · 🔵 bundled |
| **Memory hashrate test** (Etchash, offline benchmark) at stock and at a typical mining profile, vs. a reference table (e.g. Kryptex) | Memory wear (errors, low hashrate); **above** stock means modified timings | 🟢 own laptop only (lolMiner) · 🔵 own benchmark (avoids antivirus flags) |
| **Sustained core test** (CUDA matrix multiplication), watching for clocks dropping | Core wear from AI training | 🔵 |
| Each display output + a check for artifacts | Dead ports, memory faults | 🔵 |
| Power per input (slot vs. 8/16-pin cables) via LibreHardwareMonitor | Power delivery imbalance | 🔵 |
| Hotspot / memory junction temperature | Dried pads and paste | 🔵 (`nvidia-smi` can't read these on GeForce) |
| **Burn-in** of 1–2 hours with heat cycles | Intermittent faults | 🔵 premium option |

**Safety rules:**
- Abort if the core goes over 90°C, or memory/hotspot over about 100–105°C.
- Stock settings and published mining profiles only. Never raise voltage.
- About 90 seconds per profile.
- The seller agrees to the test terms: the shop isn't liable for faults the test reveals.

---

## 5. Physical and electrical inspection

| Method | Finds | Stage |
|---|---|---|
| **Technician checklist + photos:** screws, warranty sticker, pads, paste, corrosion, backplate discoloration, fan noise, **board warp** (straight edge), blistering | Opened card, heat damage, sag damage | 🟢 checklist + phone photos |
| **Thermal camera** under load, backplate off (matte tape on shiny parts) | Uneven power stages, hot spots from shorts or bad joints, one memory chip hotter than the rest | 🟢 photo upload · 🔵 phone thermal camera in each shop |
| **UV flashlight** | Flux residue from rework | 🔵 |
| **USB microscope:** chip markings and **date codes** (all memory chips should share one batch; the GPU chip date should be close to the board date), rework marks | Swapped chips | 🔵 deep inspection |
| **Multimeter:** resistance to ground on the core, memory and PCIe power lines vs. a reference | Shorts, solder bridges | 🔵 deep inspection |
| **X-ray / 3D CT:** solder balls, reballing, leaded vs. lead-free solder, internals of each chip, inner traces | Swapped or counterfeit chips, cracked joints | 🟣 partner lab |
| **Acoustic microscopy (C-SAM)** | Layer separation and cracks in PCB and chip packages | 🟣 partner lab |
| **TDR, lock-in thermography** | Cracked inner traces, microscopic shorts | 🟣 lab |
| **Cross-section, dye-and-pry** (destroys the card) | Definitive proof | 🟣 court-level disputes only |

**Inspection tiers:**
- **Standard** (every card): bench tests + checklist + thermal snapshot.
- **Deep inspection** (cards over ~€500): cooler off, microscope/UV photos, multimeter, full heat map, new pads.
- **Lab check** (top cards, disputes): X-ray, acoustic microscopy.

---

## 6. What can't be checked (always listed on the report)

| Problem | How it's covered |
|---|---|
| Remaining lifespan (silicon and memory ageing) | Protection period + held-back money |
| Hidden cracks that haven't failed yet | Burn-in (premium) + protection period |
| Intermittent faults beyond the test length | Burn-in + protection period |
| Exact usage hours and history | Declaration + wear tests + held-back money |
| Old water damage, cleaned up | Checklist + protection period |
| Partial damage from static electricity | Protection period |
| Faults only under untested setups | Standard test profile + protection period |
| Fan bearing life | Fan check (fans are cheap to replace) |
| Damage in shipping after the test | Dispute → shop re-test |

🟣 **Learn from the data:** every claim is tied to the card's original on-chain test, so Dibs can learn which test signals predict failures and improve the risk rating.

---

## 7. Spoofing and how it's handled

| Trick | Countermeasure | Stage |
|---|---|---|
| Fake agent or fake `nvidia-smi` on the seller's PC | **Bench-only testing** on the shop's own PC | 🟢 rule · 🔵 registered bench token · 🟣 attested agent (TPM / secure boot) |
| Flash the stock BIOS back | Memory wear still shows in the tests | 🟢 |
| New pads, cleaned card | Checklist shows **"opened, reason unknown"** | 🟢 |
| BIOS with memory clocked down | Hashrate below reference | 🔵 |
| Swap the card after the test | Fingerprint check + seal sticker | 🟢 |
| Swapped memory or GPU chips | Date codes, rework marks, X-ray | 🔵 / 🟣 |
| One farm selling through several accounts | Batch detection + linked phone numbers and wallets | 🟣 |
| A faked delivery-check result | Hackathon: best effort · roadmap: signed check | 🟣 |

---

## 8. Listing requirements

1. **Bench test passed:** no VRAM errors and no artifacts. A failing card can only be listed as **"For parts"**.
2. **Technician checklist + photos**, including the sticker serial, the seal and a thermal snapshot.
3. **Heavy-use declaration**, signed by the seller's wallet: "Was this card used for mining, AI training, 24/7 rental or rendering?" **Yes (which) / No / Don't know**.
4. **Ownership statement** + verified phone number.
5. **Repair history:** opened? re-pasted? repaired?
6. **Proof of purchase** (optional), which lowers the risk rating.
7. **Consent to the test terms.**

| Stage | Identity |
|---|---|
| 🟢 | Phone number field + an "ID checked at shop" checkbox |
| 🔵 | SMS verification + ID checked in person, stored **encrypted, off-chain** |

---

## 9. Protection tiers and held-back money

The **seller's declaration sets the protection period**, so lying is the worst deal.

| Declaration | Bench risk | Buyer protection | Held back from the seller |
|---|---|---|---|
| Not used heavily | Low / Medium | **90 days** | 10% |
| Don't know | any | 60 days | 7% |
| Heavy use, disclosed | any | 30 days | 5% |
| Not used heavily | **High** | **180 days** (or the seller changes the declaration) | 15% |
| Proven false later | — | Buyer refunded from the held money | **All forfeited** + seller flagged |

The percentages and periods are starting values to tune with mentors and shops.

- **Honest non-miner:** the 90-day badge helps sell, and the money comes back.
- **Honest ex-miner:** the shortest hold.
- **Lying miner:** the biggest stake on the card most likely to fail.

**Claim flow:**
1. The card fails within the period and the buyer opens a claim.
2. A **partner shop re-tests it**.
3. If confirmed, the held money goes to the buyer, as partial compensation, a repair, or a refund if the card is returned.
4. If not, the money goes to the seller when the period ends.

**Protection is capped at the held amount.** 🟣 Later, a protection pool funded by fees, or insurance, covers more.

**Call it "Dibs protection", not "warranty".** Private sellers usually have no legal warranty duty.

🟢 In the demo, the periods last minutes (a configurable "seconds per day" setting) so release and claims can be shown live.

---

## 10. Mismatches, disputes and legal options

- **A mismatch never refunds instantly.** It opens a dispute and the part goes back to a shop for a re-check.
- **Order of consequences for a lying seller:**
  1. Held-back money forfeited (automatic).
  2. Flagged and banned across linked phone numbers and wallets.
  3. Contractual penalty (*ugovorna kazna*) under the terms.
  4. Court or police, as a last resort.
- **Serbian law (general information, not legal advice):**
  - The Law on Obligations makes sellers liable for hidden defects present at sale, time-limited, with the limits not applying to a seller who knowingly concealed a defect.
  - Deception allows cancelling the contract, with damages.
  - Criminal fraud (*prevara*) applies for intentional, clear cases.
  - Small claims court handles typical GPU amounts.
  - Consumer protection law doesn't cover private sellers.
- **Proving "mined" is hard. Proving "the card had a fault when sold" is easier:** the test report plus the re-test report.
- **Evidence kept automatically:** the signed declaration (on-chain, timestamped), test and re-test reports, escrow history.
- **Seller flags happen only after a documented decision** (shop re-test + admin review), to avoid defamation claims.
- 🔵 **Have a lawyer check the terms and data handling.** Superteam Balkan offers legal intros via @solanamarko. Also check the **Law on Digital Assets**: holding USDC in escrow for others may need a licence.

---

## 11. On-chain record and the hardware passport

- **On-chain:** fingerprint, report hash, shop signature, time, grade, risk, key results, report URI, and the seller's declaration (via the listing).
- **Off-chain:** the full report JSON, photos, and personal data (never on-chain).
- **Lookup:** `PDA["passport", partHash]` → count; `PDA["report", partHash, n]` → each test. Instant, no searching.
- **QR code on the seal** → `/passport/<partHash>` → the card's history, read from the chain.
- 🟣 **EU Digital Product Passport (ESPR, Regulation (EU) 2024/1781):**
  - Technology-neutral. The EU registry has been operational since July 2026 and stores only ID → link.
  - ICT products are scheduled for **2029**.
  - Dibs can become the "second-life" condition layer and a DPP service provider.
  - Align with EN 18219 (IDs), EN 18220 (data carriers), EN 18222 (APIs).
  - Say "designed to fit the DPP standards", **never "DPP compliant"**.

---

## 12. What each stage includes

| | 🟢 Demo | 🔵 Business | 🟣 Scale |
|---|---|---|---|
| Chain | Solana **devnet**, Solana Playground | Solana **mainnet**, Anchor in WSL/CI, audit, Squads multisig | Compressed accounts, own indexer |
| Payment | Circle devnet USDC | USDC, server pays fees, on-ramp partner | Card/fiat checkout settling in USDC |
| App | Next.js on **Vercel + Supabase** (public link) | + Helius webhooks | Mobile app, partner API |
| Agent | Python + software checks + VRAM test | Signed .exe, bench mode, own memory benchmark, LibreHardwareMonitor | Attested agent, AMD/CPU/RAM/SSD, Linux |
| Shop tools | Phone photos | Thermal camera, microscope, UV, multimeter | Lab partners (X-ray, acoustic) |
| Identity | Phone field + checkbox | SMS + ID in person (encrypted, off-chain) | Same, multi-country |
| Disputes | Admin button | Shop re-test process | Shop deposits cut for bad certifications, random re-checks, data-driven risk |
| Disclosure | Mockup | Pool/rental account linking with consent | Automated |
