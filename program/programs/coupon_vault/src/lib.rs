//! coupon_vault: splits a Token-2022 xStock (ScaledUiAmount) into a share token (p) and a
//! 12 month dividend coupon (d), and pays coupon holders the units each multiplier bump adds.
//!
//! Accounts (all PDAs of this program):
//!   config  ["config"]                 admin, auth bump
//!   auth    ["auth"]                   mint authority of every p and d mint, owner of the xStock
//!                                      vault token accounts, ScaledUiAmount authority of test mints
//!   market  ["market", x_mint]         x, p, d mints, base multiplier, maturity
//!   pos     ["pos", market, d_account] multiplier snapshot and income owed, per d token account
//!   payer   ["payer"]                  system account that pays rent for positions the hook opens
//!   metas   ["extra-account-metas", d] Token-2022 transfer hook account list for each d mint
//!
//! Transfer hook: every d mint carries the Token-2022 TransferHook extension pointing at this
//! program. On every transfer (wallet to wallet, Phantom, pools) Token-2022 calls `execute`, which
//! books the source account's income up to now into `owed`, does the same for the destination on
//! its balance before the transfer, and resets both snapshots, so a holder only earns bumps that
//! happen while it holds the coupon. Positions are keyed by d token account, so several accounts
//! of one owner each settle exactly. If the destination has no position yet, the hook opens it
//! (rent from the `payer` PDA) with the current index as its snapshot.
//!
//! Math (integer base units, multipliers as 1e12 fixed point):
//!   split(a) at multiplier m mints p = d = a * m / m_base
//!   a share redeems for p * m_base / m raw units, so its UI value never changes
//!   a coupon balance claims d * m_base / snap * (m - snap) / m raw units, which is what the
//!   share side frees; claims are also capped at vault balance minus share liability,
//!   so share holders are always covered.
//!
//! Admin powers: init config and markets, and `bump`, which replays a mainnet multiplier bump
//! on a devnet test mint. The admin cannot move user funds.

use coupon_common::*;
use solana_program::{
    account_info::AccountInfo,
    clock::Clock,
    entrypoint::ProgramResult,
    instruction::{AccountMeta, Instruction},
    msg,
    program::{invoke, invoke_signed},
    rent::Rent,
    system_instruction,
    program_error::ProgramError,
    pubkey::Pubkey,
    system_program,
    sysvar::Sysvar,
};

#[cfg(not(feature = "no-entrypoint"))]
solana_program::entrypoint!(process);

pub const YEAR: i64 = 365 * 24 * 3600;
pub const CONFIG_LEN: usize = 8 + 32 + 1;
pub const MARKET_LEN: usize = 8 + 32 * 3 + 8 * 5 + 1;
pub const POS_LEN: usize = 8 + 8 + 8;
pub const N_METAS: usize = 6;
pub const METAS_LEN: usize = 8 + 4 + 4 + N_METAS * 35;
const TAG_CONFIG: &[u8; 8] = b"CPNVCFG1";
pub const TAG_MARKET: &[u8; 8] = b"CPNMKT01";
const TAG_POS: &[u8; 8] = b"CPNPOS02";

pub mod ix {
    pub const INIT_CONFIG: u8 = 0;
    pub const INIT_MARKET: u8 = 1;
    pub const SPLIT: u8 = 3;
    pub const RECOMBINE: u8 = 4;
    pub const CLAIM: u8 = 5;
    pub const REDEEM: u8 = 6;
    pub const BUMP: u8 = 9;
    pub const SYNC_METAS: u8 = 10;
}

pub struct Config {
    pub admin: Pubkey,
    pub auth_bump: u8,
}
pub struct Market {
    pub x: Pubkey,
    pub p: Pubkey,
    pub d: Pubkey,
    pub m_base: u64,
    pub m_final: u64,
    pub start: i64,
    pub maturity: i64,
    pub fair_micro: u64,
}

pub fn load_config(a: &AccountInfo, pid: &Pubkey) -> Result<Config, ProgramError> {
    let (k, _) = Pubkey::find_program_address(&[b"config"], pid);
    if a.key != &k || a.owner != pid {
        return Err(E::BadAccount.into());
    }
    let d = a.try_borrow_data()?;
    if d.len() < CONFIG_LEN || &d[..8] != TAG_CONFIG {
        return Err(E::BadAccount.into());
    }
    Ok(Config { admin: rd_pk(&d, 8), auth_bump: d[40] })
}
/// Parses a market account owned by `pid`. coupon_market calls this with VAULT_ID.
pub fn load_market(a: &AccountInfo, pid: &Pubkey) -> Result<Market, ProgramError> {
    if a.owner != pid {
        return Err(E::BadAccount.into());
    }
    let d = a.try_borrow_data()?;
    if d.len() < MARKET_LEN || &d[..8] != TAG_MARKET {
        return Err(E::BadAccount.into());
    }
    let m = Market {
        x: rd_pk(&d, 8),
        p: rd_pk(&d, 40),
        d: rd_pk(&d, 72),
        m_base: rd_u64(&d, 104),
        m_final: rd_u64(&d, 112),
        start: rd_i64(&d, 120),
        maturity: rd_i64(&d, 128),
        fair_micro: rd_u64(&d, 136),
    };
    let (k, _) = Pubkey::find_program_address(&[b"market", m.x.as_ref()], pid);
    if a.key != &k {
        return Err(E::BadAccount.into());
    }
    Ok(m)
}

pub fn process(pid: &Pubkey, accounts: &[AccountInfo], data: &[u8]) -> ProgramResult {
    if data.len() >= 16 && data[..8] == EXECUTE_DISC {
        return hook_execute(pid, accounts, arg_u64(&data[8..], 0)?);
    }
    let (&tag, rest) = data.split_first().ok_or(E::BadData)?;
    match tag {
        ix::INIT_CONFIG => init_config(pid, accounts),
        ix::INIT_MARKET => init_market(pid, accounts, arg_u64(rest, 0)?, arg_u64(rest, 1).map(|v| v as i64).unwrap_or(YEAR)),
        ix::SPLIT | ix::RECOMBINE | ix::REDEEM => position(pid, accounts, tag, arg_u64(rest, 0)?),
        ix::CLAIM => claim(pid, accounts),
        ix::SYNC_METAS => sync_metas(pid, accounts),
        ix::BUMP => bump(pid, accounts, f64::from_le_bytes(rest.get(..8).ok_or(E::BadData)?.try_into().unwrap())),
        _ => Err(E::BadData.into()),
    }
}

/// 0 init_config: [admin s w, config w, system]
fn init_config(pid: &Pubkey, a: &[AccountInfo]) -> ProgramResult {
    let [admin, config, sys, ..] = a else { return Err(ProgramError::NotEnoughAccountKeys) };
    signer(admin)?;
    let (k, b) = Pubkey::find_program_address(&[b"config"], pid);
    expect_key(config, &k)?;
    let (_, auth_bump) = Pubkey::find_program_address(&[b"auth"], pid);
    create_pda(admin, config, sys, pid, &[b"config", &[b]], CONFIG_LEN)?;
    let mut d = config.try_borrow_mut_data()?;
    d[..8].copy_from_slice(TAG_CONFIG);
    d[8..40].copy_from_slice(admin.key.as_ref());
    d[40] = auth_bump;
    msg!("event:vault_init admin={}", admin.key);
    Ok(())
}

/// 1 init_market(fair_micro, maturity_secs): [admin s w, config, market w, x_mint, p_mint, d_mint, system, metas w]
/// p and d must be fresh 8 decimal mints whose authority is the vault auth PDA, and the d mint must
/// name this program as its transfer hook. The test deployment lets the admin pick the maturity
/// (the devnet short maturity market uses minutes); a `fixed-maturity` build pins it to 12 months.
fn init_market(pid: &Pubkey, a: &[AccountInfo], fair: u64, maturity_secs: i64) -> ProgramResult {
    let [admin, config, market, x, p, dm, sys, metas, ..] = a else { return Err(ProgramError::NotEnoughAccountKeys) };
    #[cfg(feature = "fixed-maturity")]
    let maturity_secs = YEAR;
    if maturity_secs <= 0 {
        return Err(E::BadData.into());
    }
    let cfg = load_config(config, pid)?;
    signer(admin)?;
    if admin.key != &cfg.admin {
        return Err(E::Unauthorized.into());
    }
    let (auth, _) = Pubkey::find_program_address(&[b"auth"], pid);
    for mint in [p, dm] {
        let mi = read_mint(mint)?;
        if mi.authority != Some(auth) || mi.supply != 0 || mi.decimals != X_DECIMALS {
            return Err(E::BadAccount.into());
        }
    }
    {
        let dd = dm.try_borrow_data()?;
        let hook = find_ext(&dd, EXT_TRANSFER_HOOK).ok_or(E::BadAccount)?;
        if hook.len() < 64 || &rd_pk(hook, 32) != pid {
            msg!("d mint must use coupon_vault as its transfer hook");
            return Err(E::BadAccount.into());
        }
    }
    let now = Clock::get()?.unix_timestamp;
    let (m, _) = read_scaled(x, now)?;
    let (k, b) = Pubkey::find_program_address(&[b"market", x.key.as_ref()], pid);
    expect_key(market, &k)?;
    create_pda(admin, market, sys, pid, &[b"market", x.key.as_ref(), &[b]], MARKET_LEN)?;
    let mut d = market.try_borrow_mut_data()?;
    d[..8].copy_from_slice(TAG_MARKET);
    d[8..40].copy_from_slice(x.key.as_ref());
    d[40..72].copy_from_slice(p.key.as_ref());
    d[72..104].copy_from_slice(dm.key.as_ref());
    d[104..112].copy_from_slice(&m.to_le_bytes());
    d[112..120].copy_from_slice(&0u64.to_le_bytes());
    d[120..128].copy_from_slice(&now.to_le_bytes());
    d[128..136].copy_from_slice(&now.checked_add(maturity_secs).ok_or(E::Math)?.to_le_bytes());
    d[136..144].copy_from_slice(&fair.to_le_bytes());
    d[144] = b;
    drop(d);
    init_metas(pid, admin, market, x, dm, metas, sys)?;
    msg!("event:market_init x={} p={} d={} m_base={} maturity={}", x.key, p.key, dm.key, m, now + maturity_secs);
    Ok(())
}

/// Writes the ExtraAccountMetaList Token-2022 reads on every d transfer:
/// 5 market (w), 6 x mint, 7 pos of the source token account (w), 8 pos of the destination token
/// account (w), 9 rent payer PDA (w), 10 System Program.
fn write_metas(d: &mut [u8], market: &Pubkey, x: &Pubkey) {
    d[..8].copy_from_slice(&EXECUTE_DISC);
    d[8..12].copy_from_slice(&((4 + N_METAS * 35) as u32).to_le_bytes());
    d[12..16].copy_from_slice(&(N_METAS as u32).to_le_bytes());
    let mut put = |i: usize, disc: u8, cfg: [u8; 32], w: bool| {
        let o = 16 + i * 35;
        d[o] = disc;
        d[o + 1..o + 33].copy_from_slice(&cfg);
        d[o + 33] = 0;
        d[o + 34] = w as u8;
    };
    put(0, 0, market.to_bytes(), true);
    put(1, 0, x.to_bytes(), false);
    // seeds: literal "pos", key of account 5 (market), key of account 0 (source) or 2 (destination)
    for (i, acct) in [(2usize, 0u8), (3, 2)] {
        let mut c = [0u8; 32];
        c[..9].copy_from_slice(&[1, 3, b'p', b'o', b's', 3, 5, 3, acct]);
        put(i, 1, c, true);
    }
    let mut c = [0u8; 32];
    c[..7].copy_from_slice(&[1, 5, b'p', b'a', b'y', b'e', b'r']);
    put(4, 1, c, true);
    put(5, 0, system_program::ID.to_bytes(), false);
}
fn init_metas<'a>(pid: &Pubkey, admin: &AccountInfo<'a>, market: &AccountInfo<'a>, x: &AccountInfo<'a>, dm: &AccountInfo<'a>, metas: &AccountInfo<'a>, sys: &AccountInfo<'a>) -> ProgramResult {
    let (k, b) = Pubkey::find_program_address(&[b"extra-account-metas", dm.key.as_ref()], pid);
    expect_key(metas, &k)?;
    create_pda(admin, metas, sys, pid, &[b"extra-account-metas", dm.key.as_ref(), &[b]], METAS_LEN)?;
    write_metas(&mut metas.try_borrow_mut_data()?, market.key, x.key);
    Ok(())
}

/// 10 sync_metas: [admin s w, config, market, d_mint, metas w, system]
/// Rewrites a market's hook account list in the current layout (resizing it if needed), so
/// existing d mints follow a program upgrade without new mints.
fn sync_metas(pid: &Pubkey, a: &[AccountInfo]) -> ProgramResult {
    let [admin, config, market, dm, metas, sys, ..] = a else { return Err(ProgramError::NotEnoughAccountKeys) };
    let cfg = load_config(config, pid)?;
    signer(admin)?;
    if admin.key != &cfg.admin {
        return Err(E::Unauthorized.into());
    }
    let mk = load_market(market, pid)?;
    expect_key(dm, &mk.d)?;
    expect_key(sys, &system_program::ID)?;
    let (k, _) = Pubkey::find_program_address(&[b"extra-account-metas", dm.key.as_ref()], pid);
    expect_key(metas, &k)?;
    if metas.owner != pid {
        return Err(E::BadAccount.into());
    }
    if metas.data_len() != METAS_LEN {
        let need = Rent::get()?.minimum_balance(METAS_LEN).saturating_sub(metas.lamports());
        if need > 0 {
            invoke(&system_instruction::transfer(admin.key, metas.key, need), &[admin.clone(), metas.clone(), sys.clone()])?;
        }
        metas.resize(METAS_LEN)?;
    }
    write_metas(&mut metas.try_borrow_mut_data()?, market.key, &mk.x);
    msg!("event:sync_metas d={}", dm.key);
    Ok(())
}

/// Books income owed on `bal` since the snapshot and resets the snapshot to m. Positions are keyed
/// by d token account, so every account settles on its own balance exactly.
fn accrue(pid: &Pubkey, market: &AccountInfo, pos: &AccountInfo, acct: &Pubkey, bal: u64, m_base: u64, m: u64) -> ProgramResult {
    let (k, _) = Pubkey::find_program_address(&[b"pos", market.key.as_ref(), acct.as_ref()], pid);
    expect_key(pos, &k)?;
    if pos.lamports() == 0 || pos.owner != pid {
        return Ok(());
    }
    let mut d = pos.try_borrow_mut_data()?;
    if d.len() < POS_LEN || &d[..8] != TAG_POS {
        return Err(E::BadAccount.into());
    }
    let snap = rd_u64(&d, 8);
    let owed = rd_u64(&d, 16).checked_add(coupon_claim(bal, m_base, snap, m)?).ok_or(E::Math)?;
    d[8..16].copy_from_slice(&m.to_le_bytes());
    d[16..24].copy_from_slice(&owed.to_le_bytes());
    Ok(())
}

/// Opens the destination account's position inside the hook, paid by the protocol rent payer PDA
/// (a system account of this program funded by the deployer). The snapshot is the current index,
/// so the receiver earns from the moment the coupons arrive. If the payer cannot cover the rent
/// the transfer still succeeds and the position opens at the holder's first claim instead.
fn open_pos<'a>(pid: &Pubkey, market: &AccountInfo<'a>, acct: &Pubkey, pos: &AccountInfo<'a>, payer: &AccountInfo<'a>, sys: &AccountInfo<'a>, m: u64) -> Result<bool, ProgramError> {
    let (k, b) = Pubkey::find_program_address(&[b"pos", market.key.as_ref(), acct.as_ref()], pid);
    expect_key(pos, &k)?;
    let (pk, pb) = Pubkey::find_program_address(&[b"payer"], pid);
    expect_key(payer, &pk)?;
    expect_key(sys, &system_program::ID)?;
    let rent = Rent::get()?;
    let cost = rent.minimum_balance(POS_LEN);
    if payer.owner != &system_program::ID || payer.lamports() < cost + rent.minimum_balance(0) {
        msg!("rent payer low: position opens at first claim");
        return Ok(false);
    }
    invoke_signed(
        &system_instruction::create_account(payer.key, pos.key, cost, POS_LEN as u64, pid),
        &[payer.clone(), pos.clone(), sys.clone()],
        &[&[b"payer", &[pb]], &[b"pos", market.key.as_ref(), acct.as_ref(), &[b]]],
    )?;
    let mut d = pos.try_borrow_mut_data()?;
    d[..8].copy_from_slice(TAG_POS);
    d[8..16].copy_from_slice(&m.to_le_bytes());
    d[16..24].copy_from_slice(&0u64.to_le_bytes());
    Ok(true)
}

/// Transfer hook execute(amount): [0 source, 1 d mint, 2 destination, 3 authority, 4 metas,
///  5 market w, 6 x mint, 7 source pos w, 8 destination pos w, 9 rent payer w, 10 system].
/// Only runs inside a real Token-2022
/// transfer (the source account's `transferring` flag is set), after balances moved.
fn hook_execute(pid: &Pubkey, a: &[AccountInfo], amount: u64) -> ProgramResult {
    let [src, dm, dst, _authority, metas, market, x, spos, dpos, payer, sys, ..] = a else { return Err(ProgramError::NotEnoughAccountKeys) };
    let (mk_key, _) = Pubkey::find_program_address(&[b"extra-account-metas", dm.key.as_ref()], pid);
    expect_key(metas, &mk_key)?;
    let (s_owner, s_post) = {
        if src.owner != &TOKEN_2022 {
            return Err(E::BadAccount.into());
        }
        let d = src.try_borrow_data()?;
        let flag = find_ext(&d, EXT_TRANSFER_HOOK_ACCOUNT).ok_or(E::Unauthorized)?;
        if flag.first() != Some(&1) {
            return Err(E::Unauthorized.into());
        }
        (rd_pk(&d, 32), rd_u64(&d, 64))
    };
    let mut mk = load_market(market, pid)?;
    expect_key(dm, &mk.d)?;
    expect_key(x, &mk.x)?;
    let (d_owner, d_post) = {
        if dst.owner != &TOKEN_2022 {
            return Err(E::BadAccount.into());
        }
        let d = dst.try_borrow_data()?;
        if &rd_pk(&d, 0) != dm.key {
            return Err(E::BadAccount.into());
        }
        (rd_pk(&d, 32), rd_u64(&d, 64))
    };
    let (m, _) = effective_m(market, &mut mk, x)?;
    let same = src.key == dst.key;
    let s_pre = if same { s_post } else { s_post.checked_add(amount).ok_or(E::Math)? };
    let d_pre = if same { d_post } else { d_post.saturating_sub(amount) };
    accrue(pid, market, spos, src.key, s_pre, mk.m_base, m)?;
    if dpos.lamports() == 0 {
        open_pos(pid, market, dst.key, dpos, payer, sys, m)?;
    } else {
        accrue(pid, market, dpos, dst.key, d_pre, mk.m_base, m)?;
    }
    msg!("event:transfer d={} from={} to={} amount={} m={}", dm.key, s_owner, d_owner, amount, m);
    Ok(())
}

/// Effective multiplier: live until maturity, then frozen at the first read after maturity.
fn effective_m(market: &AccountInfo, mk: &mut Market, x: &AccountInfo) -> Result<(u64, bool), ProgramError> {
    let now = Clock::get()?.unix_timestamp;
    if matured(now, mk.maturity) {
        if mk.m_final == 0 {
            mk.m_final = read_scaled(x, now)?.0;
            market.try_borrow_mut_data()?[112..120].copy_from_slice(&mk.m_final.to_le_bytes());
        }
        Ok((mk.m_final, true))
    } else {
        Ok((read_scaled(x, now)?.0, false))
    }
}

/// Pays the holder's pending coupon income and resets the snapshot to m. Creates the position on
/// first touch. Every change to a wallet's d balance made through COUPON programs calls this first.
#[allow(clippy::too_many_arguments)]
fn settle<'a>(
    pid: &Pubkey,
    cfg: &Config,
    mk: &Market,
    m: u64,
    market: &AccountInfo<'a>,
    user: &AccountInfo<'a>,
    pos: &AccountInfo<'a>,
    x: &AccountInfo<'a>,
    p: &AccountInfo<'a>,
    ux: &AccountInfo<'a>,
    acct: &Pubkey,
    d_bal: u64,
    vault: &AccountInfo<'a>,
    auth: &AccountInfo<'a>,
    sys: &AccountInfo<'a>,
) -> Result<u64, ProgramError> {
    let (pk, pb) = Pubkey::find_program_address(&[b"pos", market.key.as_ref(), acct.as_ref()], pid);
    expect_key(pos, &pk)?;
    let mut paid = 0u64;
    if pos.lamports() == 0 {
        create_pda(user, pos, sys, pid, &[b"pos", market.key.as_ref(), acct.as_ref(), &[pb]], POS_LEN)?;
        pos.try_borrow_mut_data()?[..8].copy_from_slice(TAG_POS);
    } else {
        if pos.owner != pid || &pos.try_borrow_data()?[..8] != TAG_POS {
            return Err(E::BadAccount.into());
        }
        let (snap, owed) = {
            let d = pos.try_borrow_data()?;
            (rd_u64(&d, 8), rd_u64(&d, 16))
        };
        let pending = coupon_claim(d_bal, mk.m_base, snap, m)?.checked_add(owed).ok_or(E::Math)?;
        if pending > 0 {
            // cap: never pay into the share holders' reserve
            let vault_bal = check_ta(vault, x.key, auth.key)?;
            let liability = share_value_up(read_mint(p)?.supply, mk.m_base, m)?;
            paid = pending.min(vault_bal.saturating_sub(liability));
            if paid > 0 {
                invoke_signed(&ix_transfer(vault.key, x.key, ux.key, auth.key, paid, X_DECIMALS), &[vault.clone(), x.clone(), ux.clone(), auth.clone()], &[&[b"auth", &[cfg.auth_bump]]])?;
            }
        }
    }
    {
        let mut d = pos.try_borrow_mut_data()?;
        d[8..16].copy_from_slice(&m.to_le_bytes());
        d[16..24].copy_from_slice(&0u64.to_le_bytes());
    }
    if paid > 0 {
        msg!("event:claim x={} user={} raw={} m={}", x.key, user.key, paid, m);
    }
    Ok(paid)
}

/// 3 split(amount), 4 recombine(amount), 6 redeem(amount):
/// [0 user s w, 1 config, 2 market w, 3 pos w, 4 x_mint, 5 p_mint w, 6 d_mint w, 7 user_x w,
///  8 user_p w, 9 user_d w, 10 vault_x w, 11 auth, 12 token, 13 system]
fn position(pid: &Pubkey, a: &[AccountInfo], tag: u8, amount: u64) -> ProgramResult {
    let [user, config, market, pos, x, p, dm, ux, up, ud, vault, auth, tok, sys, ..] = a else { return Err(ProgramError::NotEnoughAccountKeys) };
    signer(user)?;
    if amount == 0 {
        return Err(E::ZeroAmount.into());
    }
    let cfg = load_config(config, pid)?;
    let mut mk = load_market(market, pid)?;
    expect_key(x, &mk.x)?;
    expect_key(p, &mk.p)?;
    expect_key(dm, &mk.d)?;
    let (ak, _) = Pubkey::find_program_address(&[b"auth"], pid);
    expect_key(auth, &ak)?;
    expect_key(tok, &TOKEN_2022)?;
    expect_key(sys, &system_program::ID)?;
    let x_bal = check_ta(ux, x.key, user.key)?;
    let p_bal = check_ta(up, p.key, user.key)?;
    let d_bal = check_ta(ud, dm.key, user.key)?;
    check_ta(vault, x.key, auth.key)?;
    let (m, matured) = effective_m(market, &mut mk, x)?;
    if matured && tag == ix::SPLIT {
        return Err(E::Matured.into());
    }
    if tag == ix::REDEEM && !matured {
        return Err(E::NotMatured.into());
    }
    settle(pid, &cfg, &mk, m, market, user, pos, x, p, ux, ud.key, d_bal, vault, auth, sys)?;
    let signer_seeds: &[&[u8]] = &[b"auth", &[cfg.auth_bump]];
    match tag {
        ix::SPLIT => {
            if x_bal < amount {
                return Err(E::Insufficient.into());
            }
            invoke(&ix_transfer(ux.key, x.key, vault.key, user.key, amount, X_DECIMALS), &[ux.clone(), x.clone(), vault.clone(), user.clone()])?;
            let minted = share_value(amount, m, mk.m_base)?; // p * m_base / m == amount
            for (mint, dst) in [(p, up), (dm, ud)] {
                invoke_signed(&ix_mint_to(mint.key, dst.key, auth.key, minted), &[mint.clone(), dst.clone(), auth.clone()], &[signer_seeds])?;
            }
            msg!("event:split x={} user={} in={} p={} d={} m={}", x.key, user.key, amount, minted, minted, m);
        }
        _ => {
            if p_bal < amount || (tag == ix::RECOMBINE && d_bal < amount) {
                return Err(E::Insufficient.into());
            }
            invoke(&ix_burn(up.key, p.key, user.key, amount), &[up.clone(), p.clone(), user.clone()])?;
            if tag == ix::RECOMBINE {
                invoke(&ix_burn(ud.key, dm.key, user.key, amount), &[ud.clone(), dm.clone(), user.clone()])?;
            }
            let out = share_value(amount, mk.m_base, m)?;
            invoke_signed(&ix_transfer(vault.key, x.key, ux.key, auth.key, out, X_DECIMALS), &[vault.clone(), x.clone(), ux.clone(), auth.clone()], &[signer_seeds])?;
            msg!("event:{} x={} user={} burned={} out={} m={}", if tag == ix::RECOMBINE { "recombine" } else { "redeem" }, x.key, user.key, amount, out, m);
        }
    }
    Ok(())
}

/// 5 claim: [0 user s w, 1 config, 2 market w, 3 pos w, 4 x_mint, 5 p_mint, 6 d_mint, 7 user_x w,
///  8 user_d, 9 vault_x w, 10 auth, 11 token, 12 system]
/// coupon_market calls this by CPI before any pool move of the user's d balance.
fn claim(pid: &Pubkey, a: &[AccountInfo]) -> ProgramResult {
    let [user, config, market, pos, x, p, dm, ux, ud, vault, auth, tok, sys, ..] = a else { return Err(ProgramError::NotEnoughAccountKeys) };
    signer(user)?;
    let cfg = load_config(config, pid)?;
    let mut mk = load_market(market, pid)?;
    expect_key(x, &mk.x)?;
    expect_key(p, &mk.p)?;
    expect_key(dm, &mk.d)?;
    let (ak, _) = Pubkey::find_program_address(&[b"auth"], pid);
    expect_key(auth, &ak)?;
    expect_key(tok, &TOKEN_2022)?;
    expect_key(sys, &system_program::ID)?;
    check_ta(ux, x.key, user.key)?;
    let d_bal = check_ta(ud, dm.key, user.key)?;
    check_ta(vault, x.key, auth.key)?;
    let (m, _) = effective_m(market, &mut mk, x)?;
    let paid = settle(pid, &cfg, &mk, m, market, user, pos, x, p, ux, ud.key, d_bal, vault, auth, sys)?;
    if paid == 0 {
        msg!("event:claim x={} user={} raw=0 m={}", x.key, user.key, m);
    }
    Ok(())
}

/// 9 bump(new_multiplier f64): [admin s, config, market, x_mint w, auth, token]
/// Replays a mainnet multiplier bump on a devnet test mint (the vault auth is its multiplier authority).
fn bump(pid: &Pubkey, a: &[AccountInfo], nm: f64) -> ProgramResult {
    let [admin, config, market, x, auth, tok, ..] = a else { return Err(ProgramError::NotEnoughAccountKeys) };
    let cfg = load_config(config, pid)?;
    signer(admin)?;
    if admin.key != &cfg.admin {
        return Err(E::Unauthorized.into());
    }
    let mk = load_market(market, pid)?;
    expect_key(x, &mk.x)?;
    expect_key(tok, &TOKEN_2022)?;
    let now = Clock::get()?.unix_timestamp;
    let (cur, _) = read_scaled(x, now)?;
    if !nm.is_finite() || ((nm * 1e12) as u64) <= cur {
        return Err(E::BadData.into());
    }
    let mut data = vec![43u8, 1u8];
    data.extend_from_slice(&nm.to_le_bytes());
    data.extend_from_slice(&now.to_le_bytes());
    let ixn = Instruction { program_id: TOKEN_2022, accounts: vec![AccountMeta::new(*x.key, false), AccountMeta::new_readonly(*auth.key, true)], data };
    invoke_signed(&ixn, &[x.clone(), auth.clone()], &[&[b"auth", &[cfg.auth_bump]]])?;
    msg!("event:bump x={} from={} to={}", x.key, cur, (nm * 1e12) as u64);
    Ok(())
}
