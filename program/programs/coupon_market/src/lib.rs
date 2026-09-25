//! coupon_market: one constant product pool per coupon (d/USDC).
//!
//! Accounts (PDAs of this program):
//!   config  ["config"]        admin, USDC mint
//!   pool    ["pool", d_mint]  vault market, x, d and LP mints, bump. Owns both reserve token
//!                             accounts (its associated token accounts) and is the LP mint authority.
//!
//! Only genuine coupons get pools: the d mint's mint authority must be coupon_vault's auth PDA
//! (derived from VAULT_ID) and the coupon_vault market account must list that d mint.
//!
//! Claim accounting: coupon income is tracked per holder by a multiplier snapshot in coupon_vault.
//! Before every swap or liquidity move changes a user's d balance, this program CPIs coupon_vault
//! `claim` for that user, which pays pending income and resets the snapshot. So d bought from or
//! withdrawn from a pool only earns from the moment it arrives. d held by a pool earns nothing for
//! LPs; that income stays in the vault as surplus. The fee (0.30%) stays in the pool for LPs.
//!
//! Admin powers: init config and open a pool with its seed liquidity. Nothing else.

use coupon_common::*;
use coupon_vault::load_market;
use solana_program::{
    account_info::AccountInfo,
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

pub const CONFIG_LEN: usize = 8 + 32 + 32;
pub const POOL_LEN: usize = 8 + 32 * 4 + 1;
const TAG_CONFIG: &[u8; 8] = b"CPNMCFG1";
const TAG_POOL: &[u8; 8] = b"CPNPOOL1";

pub mod ix {
    pub const INIT_CONFIG: u8 = 0;
    pub const INIT_POOL: u8 = 1;
    pub const SWAP_SELL: u8 = 2;
    pub const SWAP_BUY: u8 = 3;
    pub const ADD_LIQUIDITY: u8 = 4;
    pub const REMOVE_LIQUIDITY: u8 = 5;
}

struct Config {
    admin: Pubkey,
    usdc: Pubkey,
}
fn load_config(a: &AccountInfo, pid: &Pubkey) -> Result<Config, ProgramError> {
    let (k, _) = Pubkey::find_program_address(&[b"config"], pid);
    if a.key != &k || a.owner != pid {
        return Err(E::BadAccount.into());
    }
    let d = a.try_borrow_data()?;
    if d.len() < CONFIG_LEN || &d[..8] != TAG_CONFIG {
        return Err(E::BadAccount.into());
    }
    Ok(Config { admin: rd_pk(&d, 8), usdc: rd_pk(&d, 40) })
}

pub fn process(pid: &Pubkey, accounts: &[AccountInfo], data: &[u8]) -> ProgramResult {
    let (&tag, rest) = data.split_first().ok_or(E::BadData)?;
    match tag {
        ix::INIT_CONFIG => init_config(pid, accounts),
        ix::INIT_POOL => init_pool(pid, accounts, arg_u64(rest, 0)?, arg_u64(rest, 1)?),
        ix::SWAP_SELL..=ix::REMOVE_LIQUIDITY => trade(pid, accounts, tag, arg_u64(rest, 0)?, arg_u64(rest, 1)?, arg_u64(rest, 2).unwrap_or(0)),
        _ => Err(E::BadData.into()),
    }
}

/// 0 init_config: [admin s w, config w, usdc_mint, system]
fn init_config(pid: &Pubkey, a: &[AccountInfo]) -> ProgramResult {
    let [admin, config, usdc, sys, ..] = a else { return Err(ProgramError::NotEnoughAccountKeys) };
    signer(admin)?;
    let mi = read_mint(usdc)?;
    if mi.decimals != USDC_DECIMALS {
        return Err(E::BadAccount.into());
    }
    let (k, b) = Pubkey::find_program_address(&[b"config"], pid);
    expect_key(config, &k)?;
    create_pda(admin, config, sys, pid, &[b"config", &[b]], CONFIG_LEN)?;
    let mut d = config.try_borrow_mut_data()?;
    d[..8].copy_from_slice(TAG_CONFIG);
    d[8..40].copy_from_slice(admin.key.as_ref());
    d[40..72].copy_from_slice(usdc.key.as_ref());
    msg!("event:market_config admin={} usdc={}", admin.key, usdc.key);
    Ok(())
}

/// Genuine coupon check: vault market lists this d mint and the vault auth PDA is its authority.
fn check_coupon(vault_market: &AccountInfo, d_mint: &AccountInfo) -> Result<coupon_vault::Market, ProgramError> {
    let vm = load_market(vault_market, &VAULT_ID).map_err(|_| ProgramError::from(E::NotCoupon))?;
    let (vault_auth, _) = Pubkey::find_program_address(&[b"auth"], &VAULT_ID);
    let mi = read_mint(d_mint)?;
    if &vm.d != d_mint.key || mi.authority != Some(vault_auth) {
        return Err(E::NotCoupon.into());
    }
    Ok(vm)
}

/// 1 init_pool(d_amount, usdc_amount): opens the pool at the admin's seed ratio.
/// [0 admin s w, 1 config, 2 vault_market, 3 d_mint, 4 usdc_mint, 5 pool w, 6 pool_d w, 7 pool_usdc w,
///  8 lp_mint w, 9 admin_d w, 10 admin_usdc w, 11 admin_lp w, 12 token, 13 system]
fn init_pool(pid: &Pubkey, a: &[AccountInfo], d_amt: u64, u_amt: u64) -> ProgramResult {
    let [admin, config, vmarket, dm, usdc, pool, pool_d, pool_u, lp, ad, au, alp, tok, sys, ..] = a else { return Err(ProgramError::NotEnoughAccountKeys) };
    let cfg = load_config(config, pid)?;
    signer(admin)?;
    if admin.key != &cfg.admin {
        return Err(E::Unauthorized.into());
    }
    expect_key(usdc, &cfg.usdc)?;
    expect_key(tok, &TOKEN_2022)?;
    let vm = check_coupon(vmarket, dm)?;
    if d_amt == 0 || u_amt == 0 {
        return Err(E::ZeroAmount.into());
    }
    let (pk, pb) = Pubkey::find_program_address(&[b"pool", dm.key.as_ref()], pid);
    expect_key(pool, &pk)?;
    let lmi = read_mint(lp)?;
    if lmi.authority != Some(pk) || lmi.supply != 0 || lmi.decimals != X_DECIMALS {
        return Err(E::BadAccount.into());
    }
    check_ta(pool_d, dm.key, pool.key)?;
    check_ta(pool_u, usdc.key, pool.key)?;
    check_ta(alp, lp.key, admin.key)?;
    if check_ta(ad, dm.key, admin.key)? < d_amt || check_ta(au, usdc.key, admin.key)? < u_amt {
        return Err(E::Insufficient.into());
    }
    create_pda(admin, pool, sys, pid, &[b"pool", dm.key.as_ref(), &[pb]], POOL_LEN)?;
    {
        let mut d = pool.try_borrow_mut_data()?;
        d[..8].copy_from_slice(TAG_POOL);
        d[8..40].copy_from_slice(vmarket.key.as_ref());
        d[40..72].copy_from_slice(vm.x.as_ref());
        d[72..104].copy_from_slice(dm.key.as_ref());
        d[104..136].copy_from_slice(lp.key.as_ref());
        d[136] = pb;
    }
    invoke(&ix_transfer(ad.key, dm.key, pool_d.key, admin.key, d_amt, X_DECIMALS), &[ad.clone(), dm.clone(), pool_d.clone(), admin.clone()])?;
    invoke(&ix_transfer(au.key, usdc.key, pool_u.key, admin.key, u_amt, USDC_DECIMALS), &[au.clone(), usdc.clone(), pool_u.clone(), admin.clone()])?;
    let lp_out = to64(isqrt(cm(d_amt as u128, u_amt as u128)?))?;
    invoke_signed(&ix_mint_to(lp.key, alp.key, pool.key, lp_out), &[lp.clone(), alp.clone(), pool.clone()], &[&[b"pool", dm.key.as_ref(), &[pb]]])?;
    msg!("event:pool_init d={} d_in={} usdc_in={} lp={}", dm.key, d_amt, u_amt, lp_out);
    Ok(())
}

/// 2 swap_sell(d_in, min_usdc_out), 3 swap_buy(usdc_in, min_d_out),
/// 4 add_liquidity(d_in, usdc_max, min_lp), 5 remove_liquidity(lp_in, min_d, min_usdc)
/// [0 user s w, 1 config, 2 pool w, 3 d_mint, 4 usdc_mint, 5 pool_d w, 6 pool_usdc w, 7 lp_mint w,
///  8 user_d w, 9 user_usdc w, 10 user_lp w, 11 token, 12 system, 13 vault_program,
///  14 vault_config, 15 vault_market w, 16 vault_pos w, 17 x_mint, 18 p_mint, 19 user_x w,
///  20 vault_x w, 21 vault_auth]
fn trade<'a>(pid: &Pubkey, a: &[AccountInfo<'a>], tag: u8, amount: u64, arg2: u64, arg3: u64) -> ProgramResult {
    let [user, config, pool, dm, usdc, pool_d, pool_u, lp, ud, uu, ulp, tok, sys, vprog, vconfig, vmarket, vpos, x, p, ux, vault_x, vauth, ..] = a else {
        return Err(ProgramError::NotEnoughAccountKeys);
    };
    signer(user)?;
    if amount == 0 {
        return Err(E::ZeroAmount.into());
    }
    let cfg = load_config(config, pid)?;
    expect_key(usdc, &cfg.usdc)?;
    expect_key(tok, &TOKEN_2022)?;
    expect_key(sys, &system_program::ID)?;
    expect_key(vprog, &VAULT_ID)?;
    let (pk, pb) = Pubkey::find_program_address(&[b"pool", dm.key.as_ref()], pid);
    expect_key(pool, &pk)?;
    {
        let d = pool.try_borrow_data()?;
        if pool.owner != pid || d.len() < POOL_LEN || &d[..8] != TAG_POOL {
            return Err(E::EmptyPool.into());
        }
        if &rd_pk(&d, 8) != vmarket.key || &rd_pk(&d, 72) != dm.key || &rd_pk(&d, 104) != lp.key {
            return Err(E::BadAccount.into());
        }
    }
    let vm = check_coupon(vmarket, dm)?;
    if vm.maturity <= solana_program::clock::Clock::get().map(|c| c.unix_timestamp)? && (tag == ix::SWAP_BUY || tag == ix::ADD_LIQUIDITY) {
        return Err(E::Matured.into());
    }
    let rd = check_ta(pool_d, dm.key, pool.key)?;
    let ru = check_ta(pool_u, usdc.key, pool.key)?;
    let d_bal = check_ta(ud, dm.key, user.key)?;
    let u_bal = check_ta(uu, usdc.key, user.key)?;
    check_ta(ulp, lp.key, user.key)?;
    let supply = read_mint(lp)?.supply;

    // settle the user's coupon income in coupon_vault before the d balance changes
    let claim_ix = Instruction {
        program_id: VAULT_ID,
        accounts: vec![
            AccountMeta::new(*user.key, true),
            AccountMeta::new_readonly(*vconfig.key, false),
            AccountMeta::new(*vmarket.key, false),
            AccountMeta::new(*vpos.key, false),
            AccountMeta::new_readonly(*x.key, false),
            AccountMeta::new_readonly(*p.key, false),
            AccountMeta::new_readonly(*dm.key, false),
            AccountMeta::new(*ux.key, false),
            AccountMeta::new_readonly(*ud.key, false),
            AccountMeta::new(*vault_x.key, false),
            AccountMeta::new_readonly(*vauth.key, false),
            AccountMeta::new_readonly(*tok.key, false),
            AccountMeta::new_readonly(*sys.key, false),
        ],
        data: vec![coupon_vault::ix::CLAIM],
    };
    invoke(&claim_ix, &[user.clone(), vconfig.clone(), vmarket.clone(), vpos.clone(), x.clone(), p.clone(), dm.clone(), ux.clone(), ud.clone(), vault_x.clone(), vauth.clone(), tok.clone(), sys.clone(), vprog.clone()])?;

    let seeds: &[&[u8]] = &[b"pool", dm.key.as_ref(), &[pb]];
    let pay_d = |to: &AccountInfo<'a>, amt: u64| invoke_signed(&ix_transfer(pool_d.key, dm.key, to.key, pool.key, amt, X_DECIMALS), &[pool_d.clone(), dm.clone(), to.clone(), pool.clone()], &[seeds]);
    let pay_u = |to: &AccountInfo<'a>, amt: u64| invoke_signed(&ix_transfer(pool_u.key, usdc.key, to.key, pool.key, amt, USDC_DECIMALS), &[pool_u.clone(), usdc.clone(), to.clone(), pool.clone()], &[seeds]);
    let take_d = |amt: u64| invoke(&ix_transfer(ud.key, dm.key, pool_d.key, user.key, amt, X_DECIMALS), &[ud.clone(), dm.clone(), pool_d.clone(), user.clone()]);
    let take_u = |amt: u64| invoke(&ix_transfer(uu.key, usdc.key, pool_u.key, user.key, amt, USDC_DECIMALS), &[uu.clone(), usdc.clone(), pool_u.clone(), user.clone()]);

    match tag {
        ix::SWAP_SELL => {
            if d_bal < amount {
                return Err(E::Insufficient.into());
            }
            let out = swap_out(amount, rd, ru)?;
            if out == 0 || out < arg2 {
                return Err(E::Slippage.into());
            }
            take_d(amount)?;
            pay_u(uu, out)?;
            msg!("event:swap side=sell d={} user={} d_in={} usdc_out={} reserve_d={} reserve_usdc={}", dm.key, user.key, amount, out, rd + amount, ru - out);
        }
        ix::SWAP_BUY => {
            if u_bal < amount {
                return Err(E::Insufficient.into());
            }
            let out = swap_out(amount, ru, rd)?;
            if out == 0 || out < arg2 {
                return Err(E::Slippage.into());
            }
            take_u(amount)?;
            pay_d(ud, out)?;
            msg!("event:swap side=buy d={} user={} usdc_in={} d_out={} reserve_d={} reserve_usdc={}", dm.key, user.key, amount, out, rd - out, ru + amount);
        }
        ix::ADD_LIQUIDITY => {
            if rd == 0 || supply == 0 {
                return Err(E::EmptyPool.into());
            }
            // usdc needed at the current ratio, rounded up in the pool's favour
            let u_in = to64(cd(cm(amount as u128, ru as u128)?.checked_add(rd as u128 - 1).ok_or(E::Math)?, rd as u128)?)?;
            let lp_out = to64(cd(cm(amount as u128, supply as u128)?, rd as u128)?)?;
            if u_in > arg2 || lp_out < arg3 || lp_out == 0 {
                return Err(E::Slippage.into());
            }
            if d_bal < amount || u_bal < u_in {
                return Err(E::Insufficient.into());
            }
            take_d(amount)?;
            take_u(u_in)?;
            invoke_signed(&ix_mint_to(lp.key, ulp.key, pool.key, lp_out), &[lp.clone(), ulp.clone(), pool.clone()], &[seeds])?;
            msg!("event:add_liquidity d={} user={} d_in={} usdc_in={} lp={}", dm.key, user.key, amount, u_in, lp_out);
        }
        ix::REMOVE_LIQUIDITY => {
            if supply == 0 {
                return Err(E::EmptyPool.into());
            }
            let d_out = to64(cd(cm(amount as u128, rd as u128)?, supply as u128)?)?;
            let u_out = to64(cd(cm(amount as u128, ru as u128)?, supply as u128)?)?;
            if d_out < arg2 || u_out < arg3 {
                return Err(E::Slippage.into());
            }
            invoke(&ix_burn(ulp.key, lp.key, user.key, amount), &[ulp.clone(), lp.clone(), user.clone()])?;
            pay_d(ud, d_out)?;
            pay_u(uu, u_out)?;
            msg!("event:remove_liquidity d={} user={} lp={} d_out={} usdc_out={}", dm.key, user.key, amount, d_out, u_out);
        }
        _ => return Err(E::BadData.into()),
    }
    Ok(())
}
