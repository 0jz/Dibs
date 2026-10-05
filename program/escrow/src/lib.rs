//! Dibs escrow. SOL is the devnet rail. USDC is the alternative rail.
//!
//! Timeouts are absolute seconds chosen once in `init` and never updated.
//! `buy` is Active-only. `confirm` is Shipped-only. A public part hash is not
//! treated as proof the card arrived: the buyer has to sign, and a mismatch
//! hash is rejected. Silence can still pay the seller after the frozen
//! confirm timeout (`auto_release`), which is the product rule.

use solana_program::{
    account_info::{next_account_info, AccountInfo},
    clock::Clock,
    entrypoint,
    entrypoint::ProgramResult,
    program::{invoke, invoke_signed},
    program_error::ProgramError,
    program_pack::Pack,
    pubkey::Pubkey,
    rent::Rent,
    system_instruction,
    sysvar::Sysvar,
};

#[cfg(not(feature = "no-entrypoint"))]
entrypoint!(process_instruction);

const ATA_PROGRAM: Pubkey = solana_program::pubkey!("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");

const ACTIVE: u8 = 1;
const PAID: u8 = 2;
const SHIPPED: u8 = 3;
const PROTECTION: u8 = 4;
const DISPUTED: u8 = 5;
const CLAIMED: u8 = 6;
const CLOSED: u8 = 7;
const CANCELLED: u8 = 8;
const REFUNDED: u8 = 9;

const RAIL_SOL: u8 = 0;
const RAIL_USDC: u8 = 1;

const CONFIG_ALLOC: usize = 200;
const LISTING_ALLOC: usize = 256;
const MIN_TIMEOUT: u64 = 60;
const MAX_TIMEOUT: u64 = 90 * 24 * 60 * 60;

const L_STATE: usize = 0;
const L_RAIL: usize = 1;
const L_FROM: usize = 2;
const L_BUMP: usize = 3;
const L_CLAIM_USED: usize = 4;
const L_HOLDBACK_BPS: usize = 6;
const L_SELLER: usize = 8;
const L_BUYER: usize = 40;
const L_HASH: usize = 72;
const L_PRICE: usize = 104;
const L_DEPOSITED: usize = 112;
const L_FEE: usize = 120;
const L_HOLDBACK: usize = 128;
const L_PAID: usize = 136;
const L_SHIPPED: usize = 144;
const L_PROTECT: usize = 152;
const L_SINCE: usize = 160;
const L_ID: usize = 168;

const C_INIT: usize = 0;
const C_BUMP: usize = 1;
const C_FEE: usize = 2;
const C_ADMIN: usize = 4;
const C_MINT: usize = 36;
const C_TREASURY: usize = 68;
const C_SHIP: usize = 100;
const C_CONFIRM: usize = 108;
const C_PROTECT: usize = 116;
const C_DISPUTE: usize = 124;
const C_CLAIM: usize = 132;

const ERR_STATE: u32 = 1;
const ERR_SIGNER: u32 = 2;
const ERR_AMOUNT: u32 = 3;
const ERR_RAIL: u32 = 4;
const ERR_HASH: u32 = 5;
const ERR_TIME: u32 = 6;
const ERR_MATH: u32 = 7;

fn err(code: u32) -> ProgramError {
    ProgramError::Custom(code)
}

struct In<'a> {
    data: &'a [u8],
    at: usize,
}

impl<'a> In<'a> {
    fn new(data: &'a [u8]) -> Self {
        Self { data, at: 0 }
    }
    fn take(&mut self, n: usize) -> Result<&'a [u8], ProgramError> {
        let end = self.at.checked_add(n).ok_or(ProgramError::InvalidInstructionData)?;
        if end > self.data.len() {
            return Err(ProgramError::InvalidInstructionData);
        }
        let out = &self.data[self.at..end];
        self.at = end;
        Ok(out)
    }
    fn u8(&mut self) -> Result<u8, ProgramError> {
        Ok(self.take(1)?[0])
    }
    fn u16(&mut self) -> Result<u16, ProgramError> {
        Ok(u16::from_le_bytes(self.take(2)?.try_into().unwrap()))
    }
    fn u64(&mut self) -> Result<u64, ProgramError> {
        Ok(u64::from_le_bytes(self.take(8)?.try_into().unwrap()))
    }
    fn hash(&mut self) -> Result<[u8; 32], ProgramError> {
        Ok(self.take(32)?.try_into().unwrap())
    }
}

fn read_u16(data: &[u8], at: usize) -> u16 {
    u16::from_le_bytes(data[at..at + 2].try_into().unwrap())
}
fn read_u64(data: &[u8], at: usize) -> u64 {
    u64::from_le_bytes(data[at..at + 8].try_into().unwrap())
}
fn read_i64(data: &[u8], at: usize) -> i64 {
    i64::from_le_bytes(data[at..at + 8].try_into().unwrap())
}
fn write_u16(data: &mut [u8], at: usize, v: u16) {
    data[at..at + 2].copy_from_slice(&v.to_le_bytes());
}
fn write_u64(data: &mut [u8], at: usize, v: u64) {
    data[at..at + 8].copy_from_slice(&v.to_le_bytes());
}
fn write_i64(data: &mut [u8], at: usize, v: i64) {
    data[at..at + 8].copy_from_slice(&v.to_le_bytes());
}
fn read_key(data: &[u8], at: usize) -> Pubkey {
    Pubkey::new_from_array(data[at..at + 32].try_into().unwrap())
}
fn write_key(data: &mut [u8], at: usize, key: &Pubkey) {
    data[at..at + 32].copy_from_slice(key.as_ref());
}

fn take_bps(price: u64, bps: u16) -> Result<u64, ProgramError> {
    u64::try_from((price as u128) * (bps as u128) / 10_000u128).map_err(|_| err(ERR_MATH))
}

pub fn quote(price: u64, fee_bps: u16, holdback_bps: u16) -> Result<(u64, u64, u64), ProgramError> {
    if fee_bps > 500 || !(500..=1500).contains(&holdback_bps) {
        return Err(err(ERR_AMOUNT));
    }
    let fee = take_bps(price, fee_bps)?;
    let holdback = take_bps(price, holdback_bps)?;
    if holdback == 0 {
        return Err(err(ERR_AMOUNT));
    }
    let seller = price.checked_sub(fee).and_then(|v| v.checked_sub(holdback)).ok_or(err(ERR_MATH))?;
    if seller == 0 {
        return Err(err(ERR_AMOUNT));
    }
    Ok((fee, holdback, seller))
}

fn pda(program_id: &Pubkey, seeds: &[&[u8]]) -> (Pubkey, u8) {
    Pubkey::find_program_address(seeds, program_id)
}

fn ata(wallet: &Pubkey, mint: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(&[wallet.as_ref(), spl_token::id().as_ref(), mint.as_ref()], &ATA_PROGRAM).0
}

fn signer(account: &AccountInfo, expected: &Pubkey) -> ProgramResult {
    if !account.is_signer || account.key != expected {
        return Err(err(ERR_SIGNER));
    }
    Ok(())
}

fn owned_by(account: &AccountInfo, owner: &Pubkey) -> ProgramResult {
    if account.owner != owner {
        return Err(ProgramError::IncorrectProgramId);
    }
    Ok(())
}

fn move_sol(from: &AccountInfo, to: &AccountInfo, amount: u64) -> ProgramResult {
    if amount == 0 {
        return Ok(());
    }
    let rent = Rent::get()?.minimum_balance(from.data_len());
    let have = **from.lamports.borrow();
    let left = have.checked_sub(amount).ok_or(ProgramError::InsufficientFunds)?;
    if left < rent {
        return Err(ProgramError::InsufficientFunds);
    }
    **from.try_borrow_mut_lamports()? -= amount;
    **to.try_borrow_mut_lamports()? += amount;
    Ok(())
}

fn move_token<'a>(
    token_program: &AccountInfo<'a>,
    source: &AccountInfo<'a>,
    dest: &AccountInfo<'a>,
    authority: &AccountInfo<'a>,
    seeds: &[&[u8]],
    amount: u64,
) -> ProgramResult {
    if amount == 0 {
        return Ok(());
    }
    if *token_program.key != spl_token::id() {
        return Err(err(ERR_RAIL));
    }
    let ix = spl_token::instruction::transfer(token_program.key, source.key, dest.key, authority.key, &[], amount)?;
    invoke_signed(
        &ix,
        &[source.clone(), dest.clone(), authority.clone(), token_program.clone()],
        &[seeds],
    )
}

fn token_amount(account: &AccountInfo) -> Result<u64, ProgramError> {
    Ok(spl_token::state::Account::unpack(&account.data.borrow())?.amount)
}

fn require_timeout(v: u64) -> ProgramResult {
    if (MIN_TIMEOUT..=MAX_TIMEOUT).contains(&v) {
        Ok(())
    } else {
        Err(err(ERR_TIME))
    }
}

pub fn process_instruction<'a>(program_id: &Pubkey, accounts: &'a [AccountInfo<'a>], data: &[u8]) -> ProgramResult {
    let mut input = In::new(data);
    match input.u8()? {
        0 => init(program_id, accounts, &mut input),
        1 => create(program_id, accounts, &mut input),
        2 => buy(program_id, accounts, &mut input),
        3 => mark_shipped(program_id, accounts, &mut input),
        4 => confirm(program_id, accounts, &mut input),
        5 => open_dispute(program_id, accounts, &mut input),
        6 => resolve_dispute(program_id, accounts, &mut input),
        7 => cancel_dispute(program_id, accounts, &mut input),
        8 => expire_dispute(program_id, accounts, &mut input),
        9 => open_claim(program_id, accounts, &mut input),
        10 => resolve_claim(program_id, accounts, &mut input),
        11 => expire_claim(program_id, accounts, &mut input),
        12 => release_holdback(program_id, accounts, &mut input),
        13 => refund_unshipped(program_id, accounts, &mut input),
        14 => auto_release(program_id, accounts, &mut input),
        15 => cancel(program_id, accounts, &mut input),
        _ => Err(ProgramError::InvalidInstructionData),
    }
}

fn load_config<'a>(program_id: &Pubkey, account: &'a AccountInfo<'a>) -> Result<(), ProgramError> {
    let (expected, _) = pda(program_id, &[b"config"]);
    if account.key != &expected {
        return Err(ProgramError::InvalidSeeds);
    }
    owned_by(account, program_id)?;
    if account.data.borrow()[C_INIT] != 1 {
        return Err(err(ERR_STATE));
    }
    Ok(())
}

fn listing_seeds(id: u64) -> [u8; 8] {
    id.to_le_bytes()
}

fn load_listing<'a>(program_id: &Pubkey, account: &'a AccountInfo<'a>, id: u64) -> Result<u8, ProgramError> {
    let id_bytes = listing_seeds(id);
    let (expected, bump) = pda(program_id, &[b"listing", &id_bytes]);
    if account.key != &expected {
        return Err(ProgramError::InvalidSeeds);
    }
    owned_by(account, program_id)?;
    let data = account.data.borrow();
    if data.len() < L_ID + 8 || read_u64(&data, L_ID) != id || data[L_BUMP] != bump {
        return Err(ProgramError::InvalidAccountData);
    }
    Ok(bump)
}

fn init<'a>(program_id: &Pubkey, accounts: &'a [AccountInfo<'a>], input: &mut In) -> ProgramResult {
    let fee_bps = input.u16()?;
    let ship = input.u64()?;
    let confirm_s = input.u64()?;
    let protection = input.u64()?;
    let dispute_s = input.u64()?;
    let claim_s = input.u64()?;
    if fee_bps > 500 {
        return Err(err(ERR_AMOUNT));
    }
    for v in [ship, confirm_s, protection, dispute_s, claim_s] {
        require_timeout(v)?;
    }

    let ai = &mut accounts.iter();
    let payer = next_account_info(ai)?;
    let config = next_account_info(ai)?;
    let mint = next_account_info(ai)?;
    let treasury = next_account_info(ai)?;
    let system = next_account_info(ai)?;
    if !payer.is_signer {
        return Err(err(ERR_SIGNER));
    }
    if *mint.owner != spl_token::id() {
        return Err(err(ERR_RAIL));
    }
    let (expected, bump) = pda(program_id, &[b"config"]);
    if config.key != &expected || *system.key != solana_program::system_program::id() {
        return Err(ProgramError::InvalidSeeds);
    }
    let rent = Rent::get()?.minimum_balance(CONFIG_ALLOC);
    let ix = system_instruction::create_account(payer.key, config.key, rent, CONFIG_ALLOC as u64, program_id);
    invoke_signed(&ix, &[payer.clone(), config.clone(), system.clone()], &[&[b"config", &[bump]]])?;

    let mut data = config.data.borrow_mut();
    data[C_INIT] = 1;
    data[C_BUMP] = bump;
    write_u16(&mut data, C_FEE, fee_bps);
    write_key(&mut data, C_ADMIN, payer.key);
    write_key(&mut data, C_MINT, mint.key);
    write_key(&mut data, C_TREASURY, treasury.key);
    write_u64(&mut data, C_SHIP, ship);
    write_u64(&mut data, C_CONFIRM, confirm_s);
    write_u64(&mut data, C_PROTECT, protection);
    write_u64(&mut data, C_DISPUTE, dispute_s);
    write_u64(&mut data, C_CLAIM, claim_s);
    Ok(())
}

fn create<'a>(program_id: &Pubkey, accounts: &'a [AccountInfo<'a>], input: &mut In) -> ProgramResult {
    let id = input.u64()?;
    let price = input.u64()?;
    let holdback_bps = input.u16()?;
    let rail = input.u8()?;
    let hash = input.hash()?;
    if price == 0 || (rail != RAIL_SOL && rail != RAIL_USDC) || !(500..=1500).contains(&holdback_bps) {
        return Err(err(ERR_AMOUNT));
    }

    let ai = &mut accounts.iter();
    let seller = next_account_info(ai)?;
    let admin = next_account_info(ai)?;
    let config = next_account_info(ai)?;
    let listing = next_account_info(ai)?;
    let system = next_account_info(ai)?;
    if !seller.is_signer {
        return Err(err(ERR_SIGNER));
    }
    load_config(program_id, config)?;
    let cfg = config.data.borrow();
    signer(admin, &read_key(&cfg, C_ADMIN))?;
    drop(cfg);
    if *system.key != solana_program::system_program::id() {
        return Err(ProgramError::IncorrectProgramId);
    }

    let id_bytes = listing_seeds(id);
    let (expected, bump) = pda(program_id, &[b"listing", &id_bytes]);
    if listing.key != &expected {
        return Err(ProgramError::InvalidSeeds);
    }
    let rent = Rent::get()?.minimum_balance(LISTING_ALLOC);
    let ix = system_instruction::create_account(seller.key, listing.key, rent, LISTING_ALLOC as u64, program_id);
    invoke_signed(
        &ix,
        &[seller.clone(), listing.clone(), system.clone()],
        &[&[b"listing", &id_bytes, &[bump]]],
    )?;

    let mut data = listing.data.borrow_mut();
    data[L_STATE] = ACTIVE;
    data[L_RAIL] = rail;
    data[L_BUMP] = bump;
    write_u16(&mut data, L_HOLDBACK_BPS, holdback_bps);
    write_key(&mut data, L_SELLER, seller.key);
    data[L_HASH..L_HASH + 32].copy_from_slice(&hash);
    write_u64(&mut data, L_PRICE, price);
    write_u64(&mut data, L_ID, id);
    Ok(())
}

fn buy<'a>(program_id: &Pubkey, accounts: &'a [AccountInfo<'a>], input: &mut In) -> ProgramResult {
    let id = input.u64()?;
    let ai = &mut accounts.iter();
    let buyer = next_account_info(ai)?;
    let config = next_account_info(ai)?;
    let listing = next_account_info(ai)?;
    if !buyer.is_signer {
        return Err(err(ERR_SIGNER));
    }
    load_config(program_id, config)?;
    let bump = load_listing(program_id, listing, id)?;
    let (rail, price, seller, holdback_bps, state) = {
        let data = listing.data.borrow();
        (
            data[L_RAIL],
            read_u64(&data, L_PRICE),
            read_key(&data, L_SELLER),
            read_u16(&data, L_HOLDBACK_BPS),
            data[L_STATE],
        )
    };
    if state != ACTIVE {
        return Err(err(ERR_STATE));
    }
    if buyer.key == &seller {
        return Err(err(ERR_SIGNER));
    }
    let fee_bps = read_u16(&config.data.borrow(), C_FEE);
    let (fee, holdback, _) = quote(price, fee_bps, holdback_bps)?;

    if rail == RAIL_SOL {
        let system = next_account_info(ai)?;
        if *system.key != solana_program::system_program::id() {
            return Err(ProgramError::IncorrectProgramId);
        }
        invoke(
            &system_instruction::transfer(buyer.key, listing.key, price),
            &[buyer.clone(), listing.clone(), system.clone()],
        )?;
    } else if rail == RAIL_USDC {
        let buyer_ata = next_account_info(ai)?;
        let vault = next_account_info(ai)?;
        let token_program = next_account_info(ai)?;
        let mint = read_key(&config.data.borrow(), C_MINT);
        if buyer_ata.key != &ata(buyer.key, &mint) || vault.key != &ata(listing.key, &mint) {
            return Err(err(ERR_RAIL));
        }
        let before = token_amount(vault)?;
        let ix = spl_token::instruction::transfer(token_program.key, buyer_ata.key, vault.key, buyer.key, &[], price)?;
        invoke(&ix, &[buyer_ata.clone(), vault.clone(), buyer.clone(), token_program.clone()])?;
        if token_amount(vault)?.checked_sub(before).ok_or(err(ERR_MATH))? != price {
            return Err(err(ERR_AMOUNT));
        }
    } else {
        return Err(err(ERR_RAIL));
    }

    let now = Clock::get()?.unix_timestamp;
    let mut data = listing.data.borrow_mut();
    data[L_STATE] = PAID;
    write_key(&mut data, L_BUYER, buyer.key);
    write_u64(&mut data, L_DEPOSITED, price);
    write_u64(&mut data, L_FEE, fee);
    write_u64(&mut data, L_HOLDBACK, holdback);
    write_i64(&mut data, L_PAID, now);
    let _ = bump;
    Ok(())
}

fn mark_shipped<'a>(program_id: &Pubkey, accounts: &'a [AccountInfo<'a>], input: &mut In) -> ProgramResult {
    let id = input.u64()?;
    let ai = &mut accounts.iter();
    let seller = next_account_info(ai)?;
    let listing = next_account_info(ai)?;
    load_listing(program_id, listing, id)?;
    let data_seller = read_key(&listing.data.borrow(), L_SELLER);
    signer(seller, &data_seller)?;
    let mut data = listing.data.borrow_mut();
    if data[L_STATE] != PAID {
        return Err(err(ERR_STATE));
    }
    data[L_STATE] = SHIPPED;
    write_i64(&mut data, L_SHIPPED, Clock::get()?.unix_timestamp);
    Ok(())
}

fn settle<'a>(program_id: &Pubkey, listing: &AccountInfo<'a>, config: &AccountInfo<'a>, rest: &[AccountInfo<'a>]) -> ProgramResult {
    let (rail, seller_amt, fee, holdback, seller, bump, id) = {
        let data = listing.data.borrow();
        let price = read_u64(&data, L_PRICE);
        let fee = read_u64(&data, L_FEE);
        let holdback = read_u64(&data, L_HOLDBACK);
        let seller_amt = price.checked_sub(fee).and_then(|v| v.checked_sub(holdback)).ok_or(err(ERR_MATH))?;
        (data[L_RAIL], seller_amt, fee, holdback, read_key(&data, L_SELLER), data[L_BUMP], read_u64(&data, L_ID))
    };
    let id_bytes = listing_seeds(id);
    let seeds: &[&[u8]] = &[b"listing", &id_bytes, &[bump]];
    let now = Clock::get()?.unix_timestamp;
    let protection = read_u64(&config.data.borrow(), C_PROTECT) as i64;

    if rail == RAIL_SOL {
        if rest.len() < 2 {
            return Err(ProgramError::NotEnoughAccountKeys);
        }
        let seller_ai = &rest[0];
        let treasury = &rest[1];
        if seller_ai.key != &seller || treasury.key != &read_key(&config.data.borrow(), C_TREASURY) {
            return Err(err(ERR_RAIL));
        }
        move_sol(listing, seller_ai, seller_amt)?;
        move_sol(listing, treasury, fee)?;
    } else if rail == RAIL_USDC {
        if rest.len() < 4 {
            return Err(ProgramError::NotEnoughAccountKeys);
        }
        let vault = &rest[0];
        let seller_ata = &rest[1];
        let treasury_ata = &rest[2];
        let token_program = &rest[3];
        let mint = read_key(&config.data.borrow(), C_MINT);
        let treasury = read_key(&config.data.borrow(), C_TREASURY);
        if vault.key != &ata(listing.key, &mint) || seller_ata.key != &ata(&seller, &mint) || treasury_ata.key != &ata(&treasury, &mint)
        {
            return Err(err(ERR_RAIL));
        }
        move_token(token_program, vault, seller_ata, listing, seeds, seller_amt)?;
        move_token(token_program, vault, treasury_ata, listing, seeds, fee)?;
    } else {
        return Err(err(ERR_RAIL));
    }

    let mut data = listing.data.borrow_mut();
    data[L_STATE] = PROTECTION;
    data[L_FROM] = 0;
    write_u64(&mut data, L_DEPOSITED, holdback);
    write_i64(&mut data, L_PROTECT, now.checked_add(protection).ok_or(err(ERR_MATH))?);
    let _ = program_id;
    Ok(())
}

fn confirm<'a>(program_id: &Pubkey, accounts: &'a [AccountInfo<'a>], input: &mut In) -> ProgramResult {
    let id = input.u64()?;
    let hash = input.hash()?;
    let ai = &mut accounts.iter();
    let buyer = next_account_info(ai)?;
    let config = next_account_info(ai)?;
    let listing = next_account_info(ai)?;
    load_config(program_id, config)?;
    load_listing(program_id, listing, id)?;
    let (state, stored, buyer_key) = {
        let data = listing.data.borrow();
        (data[L_STATE], data[L_HASH..L_HASH + 32].to_vec(), read_key(&data, L_BUYER))
    };
    signer(buyer, &buyer_key)?;
    if state != SHIPPED {
        return Err(err(ERR_STATE));
    }
    if stored.as_slice() != hash {
        return Err(err(ERR_HASH));
    }
    let rest: Vec<AccountInfo> = ai.cloned().collect();
    settle(program_id, listing, config, &rest)
}

fn open_dispute<'a>(program_id: &Pubkey, accounts: &'a [AccountInfo<'a>], input: &mut In) -> ProgramResult {
    let id = input.u64()?;
    let ai = &mut accounts.iter();
    let buyer = next_account_info(ai)?;
    let listing = next_account_info(ai)?;
    load_listing(program_id, listing, id)?;
    let buyer_key = read_key(&listing.data.borrow(), L_BUYER);
    signer(buyer, &buyer_key)?;
    let mut data = listing.data.borrow_mut();
    let state = data[L_STATE];
    if state != PAID && state != SHIPPED {
        return Err(err(ERR_STATE));
    }
    data[L_FROM] = state;
    data[L_STATE] = DISPUTED;
    write_i64(&mut data, L_SINCE, Clock::get()?.unix_timestamp);
    Ok(())
}

fn pay_all<'a>(listing: &AccountInfo<'a>, config: &AccountInfo<'a>, dest_owner: &Pubkey, rest: &[AccountInfo<'a>]) -> ProgramResult {
    let (rail, amount, bump, id) = {
        let data = listing.data.borrow();
        (data[L_RAIL], read_u64(&data, L_DEPOSITED), data[L_BUMP], read_u64(&data, L_ID))
    };
    let id_bytes = listing_seeds(id);
    let seeds: &[&[u8]] = &[b"listing", &id_bytes, &[bump]];
    if rail == RAIL_SOL {
        if rest.is_empty() {
            return Err(ProgramError::NotEnoughAccountKeys);
        }
        if rest[0].key != dest_owner {
            return Err(err(ERR_RAIL));
        }
        move_sol(listing, &rest[0], amount)?;
    } else if rail == RAIL_USDC {
        if rest.len() < 3 {
            return Err(ProgramError::NotEnoughAccountKeys);
        }
        let mint = read_key(&config.data.borrow(), C_MINT);
        if rest[0].key != &ata(listing.key, &mint) || rest[1].key != &ata(dest_owner, &mint) {
            return Err(err(ERR_RAIL));
        }
        move_token(&rest[2], &rest[0], &rest[1], listing, seeds, amount)?;
    } else {
        return Err(err(ERR_RAIL));
    }
    let mut data = listing.data.borrow_mut();
    write_u64(&mut data, L_DEPOSITED, 0);
    Ok(())
}

fn resolve_dispute<'a>(program_id: &Pubkey, accounts: &'a [AccountInfo<'a>], input: &mut In) -> ProgramResult {
    let id = input.u64()?;
    let refund_buyer = input.u8()? == 1;
    let ai = &mut accounts.iter();
    let admin = next_account_info(ai)?;
    let config = next_account_info(ai)?;
    let listing = next_account_info(ai)?;
    load_config(program_id, config)?;
    load_listing(program_id, listing, id)?;
    signer(admin, &read_key(&config.data.borrow(), C_ADMIN))?;
    if listing.data.borrow()[L_STATE] != DISPUTED {
        return Err(err(ERR_STATE));
    }
    if refund_buyer {
        let buyer = read_key(&listing.data.borrow(), L_BUYER);
        let rest: Vec<AccountInfo> = ai.cloned().collect();
        pay_all(listing, config, &buyer, &rest)?;
        listing.data.borrow_mut()[L_STATE] = REFUNDED;
        Ok(())
    } else {
        let rest: Vec<AccountInfo> = ai.cloned().collect();
        settle(program_id, listing, config, &rest)
    }
}

fn cancel_dispute<'a>(program_id: &Pubkey, accounts: &'a [AccountInfo<'a>], input: &mut In) -> ProgramResult {
    let id = input.u64()?;
    let ai = &mut accounts.iter();
    let buyer = next_account_info(ai)?;
    let listing = next_account_info(ai)?;
    load_listing(program_id, listing, id)?;
    signer(buyer, &read_key(&listing.data.borrow(), L_BUYER))?;
    let mut data = listing.data.borrow_mut();
    if data[L_STATE] != DISPUTED {
        return Err(err(ERR_STATE));
    }
    let back = data[L_FROM];
    if back != PAID && back != SHIPPED {
        return Err(err(ERR_STATE));
    }
    data[L_STATE] = back;
    data[L_FROM] = 0;
    Ok(())
}

fn expire_dispute<'a>(program_id: &Pubkey, accounts: &'a [AccountInfo<'a>], input: &mut In) -> ProgramResult {
    let id = input.u64()?;
    let ai = &mut accounts.iter();
    let config = next_account_info(ai)?;
    let listing = next_account_info(ai)?;
    load_config(program_id, config)?;
    load_listing(program_id, listing, id)?;
    let (state, from, since) = {
        let data = listing.data.borrow();
        (data[L_STATE], data[L_FROM], read_i64(&data, L_SINCE))
    };
    if state != DISPUTED || from != PAID {
        return Err(err(ERR_STATE));
    }
    let limit = read_u64(&config.data.borrow(), C_DISPUTE) as i64;
    if Clock::get()?.unix_timestamp < since.checked_add(limit).ok_or(err(ERR_MATH))? {
        return Err(err(ERR_TIME));
    }
    let buyer = read_key(&listing.data.borrow(), L_BUYER);
    let rest: Vec<AccountInfo> = ai.cloned().collect();
    pay_all(listing, config, &buyer, &rest)?;
    listing.data.borrow_mut()[L_STATE] = REFUNDED;
    Ok(())
}

fn open_claim<'a>(program_id: &Pubkey, accounts: &'a [AccountInfo<'a>], input: &mut In) -> ProgramResult {
    let id = input.u64()?;
    let ai = &mut accounts.iter();
    let buyer = next_account_info(ai)?;
    let listing = next_account_info(ai)?;
    load_listing(program_id, listing, id)?;
    signer(buyer, &read_key(&listing.data.borrow(), L_BUYER))?;
    let now = Clock::get()?.unix_timestamp;
    let mut data = listing.data.borrow_mut();
    if data[L_STATE] != PROTECTION || data[L_CLAIM_USED] != 0 || now >= read_i64(&data, L_PROTECT) {
        return Err(err(ERR_STATE));
    }
    data[L_STATE] = CLAIMED;
    write_i64(&mut data, L_SINCE, now);
    Ok(())
}

fn resolve_claim<'a>(program_id: &Pubkey, accounts: &'a [AccountInfo<'a>], input: &mut In) -> ProgramResult {
    let id = input.u64()?;
    let approve = input.u8()? == 1;
    let ai = &mut accounts.iter();
    let admin = next_account_info(ai)?;
    let config = next_account_info(ai)?;
    let listing = next_account_info(ai)?;
    load_config(program_id, config)?;
    load_listing(program_id, listing, id)?;
    signer(admin, &read_key(&config.data.borrow(), C_ADMIN))?;
    if listing.data.borrow()[L_STATE] != CLAIMED {
        return Err(err(ERR_STATE));
    }
    if !approve {
        let mut data = listing.data.borrow_mut();
        data[L_STATE] = PROTECTION;
        data[L_CLAIM_USED] = 1;
        return Ok(());
    }
    let buyer = read_key(&listing.data.borrow(), L_BUYER);
    let rest: Vec<AccountInfo> = ai.cloned().collect();
    pay_all(listing, config, &buyer, &rest)?;
    let mut data = listing.data.borrow_mut();
    data[L_STATE] = CLOSED;
    data[L_CLAIM_USED] = 1;
    Ok(())
}

fn expire_claim<'a>(program_id: &Pubkey, accounts: &'a [AccountInfo<'a>], input: &mut In) -> ProgramResult {
    let id = input.u64()?;
    let ai = &mut accounts.iter();
    let config = next_account_info(ai)?;
    let listing = next_account_info(ai)?;
    load_config(program_id, config)?;
    load_listing(program_id, listing, id)?;
    let (state, since) = {
        let data = listing.data.borrow();
        (data[L_STATE], read_i64(&data, L_SINCE))
    };
    if state != CLAIMED {
        return Err(err(ERR_STATE));
    }
    let limit = read_u64(&config.data.borrow(), C_CLAIM) as i64;
    if Clock::get()?.unix_timestamp < since.checked_add(limit).ok_or(err(ERR_MATH))? {
        return Err(err(ERR_TIME));
    }
    let mut data = listing.data.borrow_mut();
    data[L_STATE] = PROTECTION;
    data[L_CLAIM_USED] = 1;
    Ok(())
}

fn release_holdback<'a>(program_id: &Pubkey, accounts: &'a [AccountInfo<'a>], input: &mut In) -> ProgramResult {
    let id = input.u64()?;
    let ai = &mut accounts.iter();
    let config = next_account_info(ai)?;
    let listing = next_account_info(ai)?;
    load_config(program_id, config)?;
    load_listing(program_id, listing, id)?;
    let (state, end, seller) = {
        let data = listing.data.borrow();
        (data[L_STATE], read_i64(&data, L_PROTECT), read_key(&data, L_SELLER))
    };
    if state != PROTECTION || Clock::get()?.unix_timestamp < end {
        return Err(err(ERR_STATE));
    }
    let rest: Vec<AccountInfo> = ai.cloned().collect();
    pay_all(listing, config, &seller, &rest)?;
    listing.data.borrow_mut()[L_STATE] = CLOSED;
    Ok(())
}

fn refund_unshipped<'a>(program_id: &Pubkey, accounts: &'a [AccountInfo<'a>], input: &mut In) -> ProgramResult {
    let id = input.u64()?;
    let ai = &mut accounts.iter();
    let config = next_account_info(ai)?;
    let listing = next_account_info(ai)?;
    load_config(program_id, config)?;
    load_listing(program_id, listing, id)?;
    let (state, paid_at, buyer) = {
        let data = listing.data.borrow();
        (data[L_STATE], read_i64(&data, L_PAID), read_key(&data, L_BUYER))
    };
    if state != PAID {
        return Err(err(ERR_STATE));
    }
    let limit = read_u64(&config.data.borrow(), C_SHIP) as i64;
    if Clock::get()?.unix_timestamp < paid_at.checked_add(limit).ok_or(err(ERR_MATH))? {
        return Err(err(ERR_TIME));
    }
    let rest: Vec<AccountInfo> = ai.cloned().collect();
    pay_all(listing, config, &buyer, &rest)?;
    listing.data.borrow_mut()[L_STATE] = REFUNDED;
    Ok(())
}

fn auto_release<'a>(program_id: &Pubkey, accounts: &'a [AccountInfo<'a>], input: &mut In) -> ProgramResult {
    let id = input.u64()?;
    let ai = &mut accounts.iter();
    let config = next_account_info(ai)?;
    let listing = next_account_info(ai)?;
    load_config(program_id, config)?;
    load_listing(program_id, listing, id)?;
    let (state, shipped_at) = {
        let data = listing.data.borrow();
        (data[L_STATE], read_i64(&data, L_SHIPPED))
    };
    if state != SHIPPED {
        return Err(err(ERR_STATE));
    }
    let limit = read_u64(&config.data.borrow(), C_CONFIRM) as i64;
    if Clock::get()?.unix_timestamp < shipped_at.checked_add(limit).ok_or(err(ERR_MATH))? {
        return Err(err(ERR_TIME));
    }
    let rest: Vec<AccountInfo> = ai.cloned().collect();
    settle(program_id, listing, config, &rest)
}

fn cancel<'a>(program_id: &Pubkey, accounts: &'a [AccountInfo<'a>], input: &mut In) -> ProgramResult {
    let id = input.u64()?;
    let ai = &mut accounts.iter();
    let seller = next_account_info(ai)?;
    let listing = next_account_info(ai)?;
    load_listing(program_id, listing, id)?;
    signer(seller, &read_key(&listing.data.borrow(), L_SELLER))?;
    let mut data = listing.data.borrow_mut();
    if data[L_STATE] != ACTIVE || read_u64(&data, L_DEPOSITED) != 0 {
        return Err(err(ERR_STATE));
    }
    data[L_STATE] = CANCELLED;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::quote;

    #[test]
    fn ten_percent_holdback_and_four_percent_fee() {
        let (fee, holdback, seller) = quote(300_000_000, 400, 1000).unwrap();
        assert_eq!(fee, 12_000_000);
        assert_eq!(holdback, 30_000_000);
        assert_eq!(seller, 258_000_000);
    }

    #[test]
    fn dust_holdback_is_rejected() {
        assert!(quote(1, 400, 1000).is_err());
    }
}
