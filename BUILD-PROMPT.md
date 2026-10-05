# Build prompt: Dibs hackathon demo

*Paste everything below the line into your AI coding agent (Cursor with Grok, Claude Code, etc.) with the folder `C:\Users\Nikola\Desktop\Projekti\Tezga` open as the workspace. The folder is still named `Tezga`; the product is **Dibs** (renamed 2026-10-05). Written 2026-10-05.*

*Tips for Cursor: use Agent mode, and give it one numbered step at a time ("Do step 1 only, then stop"). Review each diff before accepting. Step 1 is deployed by hand in Solana Playground (in the browser), so the agent writes the program code and you paste it in.*

---

You are continuing the build of **Dibs**, a marketplace for used PC parts (GPUs first). A partner repair shop tests the part while the seller waits, the test report is signed on-chain, the buyer pays in **USDC into a Solana escrow**, and a check tool on the buyer's PC confirms the delivered card is the one that was tested. Payment is released only after that.

**Hackathon:** Colosseum Crypto World's Fair. **Submit by Oct 12, during the day, Belgrade time** (the hard deadline is 11:59pm Pacific). Judges must be able to open a **public URL**. Build only the 🟢 Demo scope below.

## Read first
- `README.md`: product, flow, risks. **Its contracts section still says Monad and is outdated: we use Solana + USDC only.**
- Renamed from Tezga: env vars are `DIBS_ADMIN_PASSWORD` / `DIBS_STORE_NAME`, the agent is `web/public/dibs_agent.py`, the staff cookie is `dibs_staff`.
- `ITEM-VERIFICATION.md`: all verification, protection-tier and dispute rules. Items tagged 🟢 are in scope.
- `web/AGENTS.md`: **this Next.js version has breaking changes.** Read the relevant guide in `web/node_modules/next/dist/docs/` before writing Next.js code.

## Current state (works today)
- `web/`: Next.js 16 (App Router, Tailwind 4, React 19). Data lives in `web/data/db.json` via `web/lib/db.ts` (`readDb` / `updateDb`).
- Staff panel at `/admin` (password from `DIBS_ADMIN_PASSWORD`, default `dibs`):
  - start a test session → 6-character code,
  - live telemetry (`components/admin/SessionLive.tsx`),
  - publish form with **kind = part | device** → listing.
- Public: `/` (listings), `/listing/[id]` (report, certificate, delivery check), `/verify`, `/stress` (WebGL GPU load page the agent opens).
- API:
  - `POST /api/agent/[code]`: agent uploads identity, phase, samples, gpuScore, results.
  - `POST /api/sessions`, `GET/DELETE /api/sessions/[id]`, `POST /api/sessions/[id]/publish` (staff only).
  - `PATCH /api/listings/[id]` (staff only).
  - `POST /api/verify` (public; part listings match if any `partHashes` entry equals `listing.deviceHash`).
- Agent `web/public/dibs_agent.py`: Python, standard library only, Windows + NVIDIA.
  - `test --server --code` and `verify --server --listing`.
  - Fingerprints: device = `sha256({"bios", "gpus"})`; part = `sha256({"gpu": "uuid|vbios"})`, one per GPU.
  - **Keep both formats unchanged.**
- Run locally: `.claude/launch.json` → `npm --prefix web run dev:lan` on port 3000.
- Not a git repo yet.

## Decisions (don't revisit)
- **Solana devnet** for the demo, **USDC only** (Circle devnet USDC; confirm the mint at faucet.circle.com, currently believed to be `4zMMC9srt5Ri5X14GAgXhaHii3GfPAEcVrfdemDncDU`).
- **Anchor program written and deployed in Solana Playground** (beta.solpg.io). The local machine has no Rust, Anchor or WSL. Keep the program source in `program/` in the repo, and copy the deployed program ID and IDL into the web app.
- **Hosting:** Vercel + **Supabase** (Postgres + Storage), replacing `db.json`.
- **Wallets:** Phantom (Solana wallet adapter) for buyer and seller. The **shop signs with a server keypair** (`SHOP_KEYPAIR` env, base58 secret).
- **Never put personal data on-chain** (seller name, phone, raw BIOS serial). Only hashes and test numbers.
- Wording: say **"Dibs protection"**, never "warranty". Say **"designed to fit EU DPP standards"**, never "DPP compliant".

## Work, in order

### 0. Repo
- `git init` at `Tezga/`, `.gitignore` (node_modules, .next, .env*, web/data, keypairs), first commit, push to a **public GitHub repo** (ask the user for the repo name/owner).
- Add an MIT `LICENSE`.
- Commit often: commit history is evidence the work was done during the hackathon.

### 1. Solana program `dibs` (Anchor), in `program/`

**Accounts (PDAs):**
- `Config ["config"]`:
  - `admin`, `usdc_mint`, `treasury` (USDC token account), `fee_bps` (300–500, default 400), `seconds_per_day` (devnet demo: 2),
  - `ship_timeout_days` (default 7), `confirm_timeout_days` (default 7),
  - tier table (below).
- `Shop ["shop", authority]`: `name` (≤32), `active`, `reports: u32`, `claims_lost: u32`.
- `Passport ["passport", part_hash]`: `count: u32`, `first_seen: i64`.
- `Report ["report", part_hash, index u32 LE]`:
  - `shop`, `part_hash [u8;32]`, `report_hash [u8;32]`, `kind` (Part | Device),
  - `grade` (A|B|C), `risk` (Low|Medium|High),
  - `max_temp: u8`, `throttle: bool`, `vram_errors: u32`, `pcie_ok: bool`,
  - `uri` (≤200), `ts: i64`.
- `Listing ["listing", listing_id u64 LE]`:
  - `report`, `part_hash`, `shop`, `seller`, `buyer: Option<Pubkey>`, `price: u64` (USDC, 6 decimals),
  - `state` (Pending | Active | Paid | Shipped | Protection | Disputed | Claimed | Closed | Cancelled | Refunded),
  - `declaration` (NotHeavyUse | HeavyUseDisclosed{kind: Mining|Ai|Rental|Render} | Unknown),
  - `protection_secs: i64`, `holdback_bps: u16`, `holdback_amount: u64`,
  - `paid_at`, `shipped_at`, `protection_end: i64`, `tracking_hash [u8;32]`.
- Vault: the USDC associated token account owned by the `Listing` PDA.

**Tier table** (program-enforced, from `ITEM-VERIFICATION.md` §9):

| declaration | report.risk | protection days | holdback |
|---|---|---|---|
| NotHeavyUse | Low/Medium | 90 | 10% |
| NotHeavyUse | High | 180 | 15% |
| Unknown | any | 60 | 7% |
| HeavyUseDisclosed | any | 30 | 5% |

**Instructions:**
- `init_config` (admin).
- `register_shop` (admin).
- `submit_report(part_hash, report_hash, kind, grade, risk, max_temp, throttle, vram_errors, pcie_ok, uri)`: active shop only. Creates the passport if missing, then increments it and creates the report.
- `create_listing(listing_id, report, seller, price)`: shop; state Pending.
- `activate_listing(declaration)`: **seller signs** (Phantom). The program computes the tier from the declaration + report risk; state Active.
- `cancel_listing`: seller or shop, only Pending or Active.
- `buy`: buyer transfers `price` USDC to the vault; state Paid.
- `mark_shipped(tracking_hash)`: seller; state Shipped.
- `confirm_match(part_hash)`: buyer; the hash must equal `listing.part_hash`.
  - Transfers `price - fee - holdback` to the seller and `fee` to the treasury, keeping the holdback in the vault.
  - Sets `protection_end = now + protection_days * seconds_per_day`; state Protection.
- `open_dispute`: buyer while Paid or Shipped (a mismatch); state Disputed.
- `resolve_dispute(refund_buyer: bool)`: admin. Full refund to the buyer, or proceed as if matched.
- `open_claim`: buyer during Protection, before `protection_end`; state Claimed.
- `resolve_claim(approve: bool)`: an active shop or the admin.
  - approve → holdback to the buyer, the shop that issued the report gets `claims_lost += 1`, state Closed.
  - reject → back to Protection.
- `release_holdback`: anyone, after `protection_end` while state is Protection → holdback to the seller; Closed.
- `refund_unshipped`: anyone, Paid and past the ship timeout → full refund; Refunded.
- `auto_release`: anyone, Shipped and past the confirm timeout → same payout as `confirm_match`.

**Events** for every state change (`ReportSubmitted`, `ListingActivated`, `Paid`, `Shipped`, `Matched`, `DisputeOpened`, …). **Errors** with clear names.

**Tests** in Playground (or the TS client): the happy path, a mismatch → dispute both ways, a claim approved and rejected, holdback release after time, both timeouts, a non-shop calling `submit_report`, a seller declaration changing the tier.

Deploy to devnet. Write the **program ID + IDL** to `web/lib/solana/`.

### 2. Supabase + Vercel
- Replace `web/lib/db.ts` with Supabase (`@supabase/supabase-js`).
  - Tables `sessions`, `listings`, `verifications`, `checklists`. Use jsonb for identity, results and samples.
  - Storage bucket `photos`.
  - **Keep the existing function shapes** so pages change minimally.
- Env:
  - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (server only),
  - `NEXT_PUBLIC_SOLANA_RPC` (devnet; a Helius free key if available), `NEXT_PUBLIC_PROGRAM_ID`, `NEXT_PUBLIC_USDC_MINT`,
  - `SHOP_KEYPAIR`, `DIBS_ADMIN_PASSWORD`, `DIBS_STORE_NAME`.
  - Document them all in `web/.env.example`.
- Deploy to Vercel. The agent's `--server` must work with the public `https://` URL.
- **Ask the user before creating accounts or projects on Supabase or Vercel.** They do the sign-up themselves.

### 3. Agent additions (`dibs_agent.py`, standard library only)
- **PCIe:** current vs. max link gen and width, plus the retransmission ("Replays Since Reset") counter from `nvidia-smi -q`.
- **Driver errors:** count NVIDIA driver (`nvlddmkm`) events in the Windows System log between test start and end.
- **PCI device ID** → LHR / non-LHR lookup for the RTX 30-series (small table in the agent).
- **VRAM test:** if `memtest_vulkan.exe` is next to the agent (or `--memtest PATH`), run it for about 60 seconds after the GPU stress test while the card is hot, and parse the error count. Otherwise report "not run".
- **Safety:** abort the stress if GPU temperature goes above 90°C.
- **Results:** send all new fields in `results.checks`.
- **No mining software, no PC-trace scanning** in the demo.

### 4. Publish form + risk rating (staff panel)
- **`lib/risk.ts`:** turns signals into `Low | Medium | High` + reasons, e.g. VRAM errors > 0 → High; non-LHR + boom-era model → +1; checklist "opened, reason unknown" → +1; throttling → +1; PCIe degraded or driver errors → High.
- **Technician checklist:** opened? reason, pads/paste, warranty sticker intact, board warp, corrosion, fan noise, plus photo uploads (front, back, sticker serial, seal, thermal snapshot) → Supabase Storage.
- **Seller section:**
  - phone number, "ID checked at shop" checkbox, ownership statement checkbox, test-terms consent,
  - the seller's **Solana wallet address**.
- **Publish:**
  1. Compute the report hash.
  2. The server signs `submit_report` + `create_listing` with `SHOP_KEYPAIR`.
  3. Save the transaction signatures.
  4. The listing is **Pending**, and the form shows a **seller activation link/QR**.
- **Seller activation page** `/listing/[id]/activate`:
  - Phantom connect (must be the seller's wallet).
  - Heavy-use declaration: Yes (mining / AI / rental / render) / No / Don't know.
  - **Live tier preview** (protection days + holdback).
  - Sign `activate_listing`.

### 5. Buyer flow + listing page
- Wallet adapter provider (Phantom).
- **Listing page:**
  - price in USDC, protection badge from the tier, declaration badge (e.g. "Seller declares no heavy use · test shows Medium risk"), heavy-use risk with reasons,
  - a **"Tested / Not tested"** list (from `ITEM-VERIFICATION.md` §6),
  - "On-chain" links to the report and listing transactions (Solana Explorer, devnet).
- **Buttons by state and connected wallet:**
  - Buy (buyer),
  - Mark shipped (seller),
  - Confirm match (buyer: enabled when the latest `/api/verify` result for this listing matches; sends that part hash),
  - Open dispute (buyer, after a mismatch),
  - Open claim (during protection),
  - Release holdback (anyone, after protection ends).
- **Escrow timeline:** Paid → Shipped → Verified → Paid out → Protection → Closed, with on-chain timestamps.
- **`/orders`:** listings where the connected wallet is the buyer or seller.
- **Admin panel:**
  - disputes and claims queue with resolve buttons (admin signs with the shop/admin keypair server-side),
  - a "register shop" bootstrap button.
- **The chain is the source of truth for state and money:** read the `Listing` account; Supabase is only a cache.

### 6. Public API + passport
- `GET /api/listings?state=&since=`
- `GET /api/listings/[id]` (merges the on-chain account + cache)
- `GET /api/passport/[partHash]` (reads the `Passport` + `Report` accounts)
- Page `/passport/[partHash]`: every test of the card, newest first, with explorer links.
- **QR code** on the listing page pointing to the passport (e.g. the `qrcode` package).

### 7. Demo readiness
- A seed script for one shop + 2 listings on devnet, so the demo isn't blank.
- An end-to-end test script (like the earlier `e2e.py`) covering: publish, activate, buy, ship, verify-match → confirm → protection → release, and the mismatch → dispute path.
- **Back up and restore data around tests.**
- Update the README: Solana instead of Monad, run and deploy steps, the public URL.

## Out of scope for now (🔵 / 🟣 in ITEM-VERIFICATION.md)
- Mainnet, audit, multisig.
- On-ramp, server-paid transaction fees.
- SMS verification, ID storage.
- The memory hashrate test with lolMiner, the sustained core test, LibreHardwareMonitor.
- PC-trace scans, mining or rental disclosure (mockup at most).
- Batch detection, lab tiers, protection pool.
- Attested agent, AMD / Linux, DPP integration.

## Rules
- Match the existing code style (small components, Tailwind, server components where possible).
- Run `npx tsc --noEmit` and `npx eslint` in `web/` after changes.
- Verify in the browser.
- Ask before deleting any file.
- Ask before anything that costs money, creates external accounts, or publishes.
