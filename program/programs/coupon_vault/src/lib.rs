//! coupon_vault: splits a Token-2022 xStock (ScaledUiAmount) into a share token (p) and a
//! 12 month dividend coupon (d), and pays coupon holders the units each multiplier bump adds.
//!
//! Accounts (all PDAs of this program):
//!   config  ["config"]                 admin, auth bump
//!   auth    ["auth"]                   mint authority of every p and d mint, owner of the xStock
//!                                      vault token accounts, ScaledUiAmount authority of test mints
//!   market  ["market", x_mint]         x, p, d mints, base multiplier, maturity
//!   pos     ["pos", market, owner]     the holder's multiplier snapshot for coupon claims
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
pub const POS_LEN: usize = 8 + 8;
const TAG_CONFIG: &[u8; 8] = b"CPNVCFG1";
pub const TAG_MARKET: &[u8; 8] = b"CPNMKT01";
const TAG_POS: &[u8; 8] = b"CPNPOS01";

pub mod ix {
    pub const INIT_CONFIG: u8 = 0;
    pub const INIT_MARKET: u8 = 1;
    pub const SPLIT: u8 = 3;
    pub const RECOMBINE: u8 = 4;
    pub const CLAIM: u8 = 5;
    pub const REDEEM: u8 = 6;
    pub const BUMP: u8 = 9;
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
    let (&tag, rest) = data.split_first().ok_or(E::BadData)?;
    match tag {
        ix::INIT_CONFIG => init_config(pid, accounts),
        ix::INIT_MARKET => init_market(pid, accounts, arg_u64(rest, 0)?, arg_u64(rest, 1).map(|v| v as i64).unwrap_or(YEAR)),
        ix::SPLIT | ix::RECOMBINE | ix::REDEEM => position(pid, accounts, tag, arg_u64(rest, 0)?),
        ix::CLAIM => claim(pid, accounts),
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

/// 1 init_market(fair_micro, maturity_secs): [admin s w, config, market w, x_mint, p_mint, d_mint, system]
/// p and d must be fresh 8 decimal mints whose authority is the vault auth PDA.
fn init_market(pid: &Pubkey, a: &[AccountInfo], fair: u64, maturity_secs: i64) -> ProgramResult {
    let [admin, config, market, x, p, dm, sys, ..] = a else { return Err(ProgramError::NotEnoughAccountKeys) };
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
    msg!("event:market_init x={} p={} d={} m_base={} maturity={}", x.key, p.key, dm.key, m, now + maturity_secs);
    Ok(())
}

/// Effective multiplier: live until maturity, then frozen at the first read after maturity.
fn effective_m(market: &AccountInfo, mk: &mut Market, x: &AccountInfo) -> Result<(u64, bool), ProgramError> {
    let now = Clock::get()?.unix_timestamp;
    if now >= mk.maturity {
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
    d_bal: u64,
    vault: &AccountInfo<'a>,
    auth: &AccountInfo<'a>,
    sys: &AccountInfo<'a>,
) -> Result<u64, ProgramError> {
    let (pk, pb) = Pubkey::find_program_address(&[b"pos", market.key.as_ref(), user.key.as_ref()], pid);
    expect_key(pos, &pk)?;
    let mut paid = 0u64;
    if pos.lamports() == 0 {
        create_pda(user, pos, sys, pid, &[b"pos", market.key.as_ref(), user.key.as_ref(), &[pb]], POS_LEN)?;
        pos.try_borrow_mut_data()?[..8].copy_from_slice(TAG_POS);
    } else {
        if pos.owner != pid || &pos.try_borrow_data()?[..8] != TAG_POS {
            return Err(E::BadAccount.into());
        }
        let snap = rd_u64(&pos.try_borrow_data()?, 8);
        let pending = coupon_claim(d_bal, mk.m_base, snap, m)?;
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
    pos.try_borrow_mut_data()?[8..16].copy_from_slice(&m.to_le_bytes());
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
    settle(pid, &cfg, &mk, m, market, user, pos, x, p, ux, d_bal, vault, auth, sys)?;
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
    let paid = settle(pid, &cfg, &mk, m, market, user, pos, x, p, ux, d_bal, vault, auth, sys)?;
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
