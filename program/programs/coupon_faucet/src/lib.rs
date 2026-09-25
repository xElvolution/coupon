//! coupon_faucet: TEST ONLY. Not part of the COUPON product.
//!
//! Hands out devnet test tokens so anyone with a devnet wallet can try COUPON: 100 units of a
//! test xStock or 1,000 test USDC per claim, once per wallet per token per hour. It can only mint
//! tokens whose mint authority is this program's `faucet` PDA (the test mints created at deploy).
//! On mainnet the real xStocks and USDC are used and this program does not exist.
//!
//! Accounts: config ["config"] (admin), faucet ["faucet"] (mint authority), drip ["drip", mint, user].

use coupon_common::*;
use solana_program::{
    account_info::AccountInfo, clock::Clock, entrypoint::ProgramResult, msg, program::invoke_signed, program_error::ProgramError, pubkey::Pubkey,
    system_program, sysvar::Sysvar,
};

#[cfg(not(feature = "no-entrypoint"))]
solana_program::entrypoint!(process);

pub const COOLDOWN: i64 = 3600;
pub const CONFIG_LEN: usize = 8 + 32 + 1;
pub const DRIP_LEN: usize = 8 + 8;
const TAG_CONFIG: &[u8; 8] = b"CPNFCFG1";
const TAG_DRIP: &[u8; 8] = b"CPNDRIP1";

pub mod ix {
    pub const INIT_CONFIG: u8 = 0;
    pub const DRIP: u8 = 1;
    pub const ADMIN_MINT: u8 = 2;
}

/// Claim size by decimals: 6 decimals is test USDC (1,000), anything else is a test xStock (100).
pub fn drip_amount(decimals: u8) -> Result<u64, ProgramError> {
    let unit = 10u64.checked_pow(decimals as u32).ok_or(E::Math)?;
    unit.checked_mul(if decimals == USDC_DECIMALS { 1_000 } else { 100 }).ok_or(E::Math.into())
}

fn load_config(a: &AccountInfo, pid: &Pubkey) -> Result<(Pubkey, u8), ProgramError> {
    let (k, _) = Pubkey::find_program_address(&[b"config"], pid);
    if a.key != &k || a.owner != pid {
        return Err(E::BadAccount.into());
    }
    let d = a.try_borrow_data()?;
    if d.len() < CONFIG_LEN || &d[..8] != TAG_CONFIG {
        return Err(E::BadAccount.into());
    }
    Ok((rd_pk(&d, 8), d[40]))
}

pub fn process(pid: &Pubkey, accounts: &[AccountInfo], data: &[u8]) -> ProgramResult {
    let (&tag, rest) = data.split_first().ok_or(E::BadData)?;
    match tag {
        ix::INIT_CONFIG => init_config(pid, accounts),
        ix::DRIP => drip(pid, accounts),
        ix::ADMIN_MINT => admin_mint(pid, accounts, arg_u64(rest, 0)?),
        _ => Err(E::BadData.into()),
    }
}

/// 0 init_config: [admin s w, config w, system]
fn init_config(pid: &Pubkey, a: &[AccountInfo]) -> ProgramResult {
    let [admin, config, sys, ..] = a else { return Err(ProgramError::NotEnoughAccountKeys) };
    signer(admin)?;
    let (k, b) = Pubkey::find_program_address(&[b"config"], pid);
    expect_key(config, &k)?;
    let (_, fb) = Pubkey::find_program_address(&[b"faucet"], pid);
    create_pda(admin, config, sys, pid, &[b"config", &[b]], CONFIG_LEN)?;
    let mut d = config.try_borrow_mut_data()?;
    d[..8].copy_from_slice(TAG_CONFIG);
    d[8..40].copy_from_slice(admin.key.as_ref());
    d[40] = fb;
    msg!("event:faucet_init admin={}", admin.key);
    Ok(())
}

/// 1 drip: [user s w, config, drip w, mint w, user_ata w, faucet, token, system]
fn drip(pid: &Pubkey, a: &[AccountInfo]) -> ProgramResult {
    let [user, config, drip, mint, ata, fauth, tok, sys, ..] = a else { return Err(ProgramError::NotEnoughAccountKeys) };
    signer(user)?;
    let (_, fb) = load_config(config, pid)?;
    let (fk, _) = Pubkey::find_program_address(&[b"faucet"], pid);
    expect_key(fauth, &fk)?;
    expect_key(tok, &TOKEN_2022)?;
    expect_key(sys, &system_program::ID)?;
    let mi = read_mint(mint)?;
    if mi.authority != Some(fk) {
        return Err(E::BadAccount.into());
    }
    check_ta(ata, mint.key, user.key)?;
    let now = Clock::get()?.unix_timestamp;
    let (k, b) = Pubkey::find_program_address(&[b"drip", mint.key.as_ref(), user.key.as_ref()], pid);
    expect_key(drip, &k)?;
    if drip.lamports() == 0 {
        create_pda(user, drip, sys, pid, &[b"drip", mint.key.as_ref(), user.key.as_ref(), &[b]], DRIP_LEN)?;
        drip.try_borrow_mut_data()?[..8].copy_from_slice(TAG_DRIP);
    } else {
        let d = drip.try_borrow_data()?;
        if drip.owner != pid || &d[..8] != TAG_DRIP {
            return Err(E::BadAccount.into());
        }
        let last = rd_i64(&d, 8);
        if now < last.checked_add(COOLDOWN).ok_or(E::Math)? {
            msg!("faucet cooldown: {}s left", last + COOLDOWN - now);
            return Err(E::Cooldown.into());
        }
    }
    drip.try_borrow_mut_data()?[8..16].copy_from_slice(&now.to_le_bytes());
    let amount = drip_amount(mi.decimals)?;
    invoke_signed(&ix_mint_to(mint.key, ata.key, fauth.key, amount), &[mint.clone(), ata.clone(), fauth.clone()], &[&[b"faucet", &[fb]]])?;
    msg!("event:drip mint={} user={} amount={}", mint.key, user.key, amount);
    Ok(())
}

/// 2 admin_mint(amount): seeds deploy liquidity. [admin s, config, mint w, dst w, faucet, token]
fn admin_mint(pid: &Pubkey, a: &[AccountInfo], amount: u64) -> ProgramResult {
    let [admin, config, mint, dst, fauth, tok, ..] = a else { return Err(ProgramError::NotEnoughAccountKeys) };
    let (adm, fb) = load_config(config, pid)?;
    signer(admin)?;
    if admin.key != &adm {
        return Err(E::Unauthorized.into());
    }
    expect_key(tok, &TOKEN_2022)?;
    invoke_signed(&ix_mint_to(mint.key, dst.key, fauth.key, amount), &[mint.clone(), dst.clone(), fauth.clone()], &[&[b"faucet", &[fb]]])?;
    msg!("event:seed_mint mint={} dst={} amount={}", mint.key, dst.key, amount);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn drip_sizes() {
        assert_eq!(drip_amount(6).unwrap(), 1_000_000_000);
        assert_eq!(drip_amount(8).unwrap(), 10_000_000_000);
    }
}
