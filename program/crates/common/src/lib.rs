//! Shared code for the three COUPON programs: program ids, error codes, integer math,
//! Token-2022 account parsing and CPI builders. No state lives here.

use solana_program::{
    account_info::AccountInfo,
    entrypoint::ProgramResult,
    instruction::{AccountMeta, Instruction},
    msg,
    program::invoke_signed,
    program_error::ProgramError,
    pubkey,
    pubkey::Pubkey,
    rent::Rent,
    system_instruction,
    sysvar::Sysvar,
};

pub const TOKEN_2022: Pubkey = pubkey!("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");
/// coupon_vault program id. coupon_market derives the vault's mint authority from it.
pub const VAULT_ID: Pubkey = pubkey!("9Q2QA1TmocSh7rDZWn8kxWGpoJHrxjDRV8NLxw2tVoVe");
pub const MARKET_ID: Pubkey = pubkey!("EPCXp2gEtwa6c28x19XgM2oV9k3T5pLsUiAzEaJUc3WN");
pub const FAUCET_ID: Pubkey = pubkey!("5SYQ5Pp1AfR2QRLQy4WFyqbHdrVtECJ1GdkwwPepEDRE");

pub const SCALE: u128 = 1_000_000_000_000; // multipliers as 1e12 fixed point
pub const X_DECIMALS: u8 = 8;
pub const USDC_DECIMALS: u8 = 6;
pub const FEE_BPS: u128 = 30; // 0.30% pool fee

/// Error codes shared by all three programs, so the client maps one table.
#[derive(Debug, Clone, Copy)]
#[repr(u32)]
pub enum CouponError {
    BadAccount = 1,
    Unauthorized = 2,
    Math = 3,
    Cooldown = 4,
    Matured = 5,
    NotMatured = 6,
    ZeroAmount = 7,
    NoMultiplier = 8,
    Insufficient = 9,
    BadData = 10,
    Slippage = 11,
    EmptyPool = 12,
    NotCoupon = 13,
    AlreadyInitialized = 14,
}
impl From<CouponError> for ProgramError {
    fn from(e: CouponError) -> Self {
        msg!("error: {:?}", e);
        ProgramError::Custom(e as u32)
    }
}
pub type E = CouponError;

// ---------- byte readers ----------
pub fn rd_pk(d: &[u8], o: usize) -> Pubkey {
    Pubkey::new_from_array(d[o..o + 32].try_into().unwrap())
}
pub fn rd_u64(d: &[u8], o: usize) -> u64 {
    u64::from_le_bytes(d[o..o + 8].try_into().unwrap())
}
pub fn rd_i64(d: &[u8], o: usize) -> i64 {
    i64::from_le_bytes(d[o..o + 8].try_into().unwrap())
}
pub fn arg_u64(data: &[u8], i: usize) -> Result<u64, ProgramError> {
    Ok(u64::from_le_bytes(data.get(i * 8..i * 8 + 8).ok_or(E::BadData)?.try_into().unwrap()))
}

// ---------- checked math ----------
pub fn cm(a: u128, b: u128) -> Result<u128, ProgramError> {
    a.checked_mul(b).ok_or(E::Math.into())
}
pub fn cd(a: u128, b: u128) -> Result<u128, ProgramError> {
    a.checked_div(b).ok_or(E::Math.into())
}
pub fn to64(a: u128) -> Result<u64, ProgramError> {
    u64::try_from(a).map_err(|_| E::Math.into())
}
/// Raw units a share redeems for at multiplier m: amount * m_base / m (constant UI value).
pub fn share_value(amount: u64, m_base: u64, m: u64) -> Result<u64, ProgramError> {
    to64(cd(cm(amount as u128, m_base as u128)?, m as u128)?)
}
/// Same, rounded up. Used for the vault's share liability so it never under-reserves.
pub fn share_value_up(amount: u64, m_base: u64, m: u64) -> Result<u64, ProgramError> {
    let n = cm(amount as u128, m_base as u128)?;
    to64(cd(n.checked_add(m as u128 - 1).ok_or(E::Math)?, m as u128)?)
}
/// Raw units a coupon balance claims when the multiplier moves from snap to m:
/// d * m_base / snap * (m - snap) / m, exactly the raw units the share side frees.
pub fn coupon_claim(d_bal: u64, m_base: u64, snap: u64, m: u64) -> Result<u64, ProgramError> {
    if m <= snap || d_bal == 0 {
        return Ok(0);
    }
    let t = cd(cm(d_bal as u128, m_base as u128)?, snap as u128)?;
    to64(cd(cm(t, (m - snap) as u128)?, m as u128)?)
}
/// Constant product output for an exact input, fee on the input side.
pub fn swap_out(amount_in: u64, r_in: u64, r_out: u64) -> Result<u64, ProgramError> {
    if r_in == 0 || r_out == 0 {
        return Err(E::EmptyPool.into());
    }
    let in_fee = cm(amount_in as u128, 10_000 - FEE_BPS)?;
    let num = cm(in_fee, r_out as u128)?;
    let den = cm(r_in as u128, 10_000)?.checked_add(in_fee).ok_or(E::Math)?;
    to64(cd(num, den)?)
}
pub fn isqrt(n: u128) -> u128 {
    if n < 2 {
        return n;
    }
    let mut x = n;
    let mut y = (x + 1) / 2;
    while y < x {
        x = y;
        y = (x + n / x) / 2;
    }
    x
}

// ---------- Token-2022 account parsing ----------
/// Token account: mint at 0, owner at 32, amount at 64. Returns the amount.
pub fn check_ta(a: &AccountInfo, mint: &Pubkey, owner: &Pubkey) -> Result<u64, ProgramError> {
    if a.owner != &TOKEN_2022 {
        return Err(E::BadAccount.into());
    }
    let d = a.try_borrow_data()?;
    if d.len() < 165 || &rd_pk(&d, 0) != mint || &rd_pk(&d, 32) != owner {
        msg!("token account mismatch {}", a.key);
        return Err(E::BadAccount.into());
    }
    Ok(rd_u64(&d, 64))
}
pub struct MintInfo {
    pub authority: Option<Pubkey>,
    pub supply: u64,
    pub decimals: u8,
}
pub fn read_mint(a: &AccountInfo) -> Result<MintInfo, ProgramError> {
    if a.owner != &TOKEN_2022 {
        return Err(E::BadAccount.into());
    }
    let d = a.try_borrow_data()?;
    if d.len() < 82 || d[45] != 1 {
        return Err(E::BadAccount.into()); // not an initialized mint
    }
    let has = u32::from_le_bytes(d[0..4].try_into().unwrap()) == 1;
    Ok(MintInfo { authority: if has { Some(rd_pk(&d, 4)) } else { None }, supply: rd_u64(&d, 36), decimals: d[44] })
}
/// Effective ScaledUiAmount multiplier (extension type 25) as 1e12 fixed point, and its authority.
pub fn read_scaled(mint: &AccountInfo, now: i64) -> Result<(u64, Pubkey), ProgramError> {
    if mint.owner != &TOKEN_2022 {
        return Err(E::BadAccount.into());
    }
    let d = mint.try_borrow_data()?;
    if d.len() < 166 || d[165] != 1 {
        return Err(E::NoMultiplier.into());
    }
    let mut o = 166;
    while o + 4 <= d.len() {
        let t = u16::from_le_bytes([d[o], d[o + 1]]);
        let l = u16::from_le_bytes([d[o + 2], d[o + 3]]) as usize;
        o += 4;
        if t == 25 && o + l <= d.len() && l >= 56 {
            let auth = rd_pk(&d, o);
            let cur = f64::from_le_bytes(d[o + 32..o + 40].try_into().unwrap());
            let ts = rd_i64(&d, o + 40);
            let next = f64::from_le_bytes(d[o + 48..o + 56].try_into().unwrap());
            let m = if ts != 0 && now >= ts { next } else { cur };
            if !(m > 0.0) || !m.is_finite() {
                return Err(E::NoMultiplier.into());
            }
            return Ok(((m * 1e12) as u64, auth));
        }
        if t == 0 {
            break;
        }
        o += l;
    }
    Err(E::NoMultiplier.into())
}

// ---------- CPI builders ----------
pub fn ix_transfer(src: &Pubkey, mint: &Pubkey, dst: &Pubkey, auth: &Pubkey, amount: u64, dec: u8) -> Instruction {
    let mut data = vec![12u8];
    data.extend_from_slice(&amount.to_le_bytes());
    data.push(dec);
    Instruction {
        program_id: TOKEN_2022,
        accounts: vec![
            AccountMeta::new(*src, false),
            AccountMeta::new_readonly(*mint, false),
            AccountMeta::new(*dst, false),
            AccountMeta::new_readonly(*auth, true),
        ],
        data,
    }
}
pub fn ix_mint_to(mint: &Pubkey, dst: &Pubkey, auth: &Pubkey, amount: u64) -> Instruction {
    let mut data = vec![7u8];
    data.extend_from_slice(&amount.to_le_bytes());
    Instruction {
        program_id: TOKEN_2022,
        accounts: vec![AccountMeta::new(*mint, false), AccountMeta::new(*dst, false), AccountMeta::new_readonly(*auth, true)],
        data,
    }
}
pub fn ix_burn(acc: &Pubkey, mint: &Pubkey, owner: &Pubkey, amount: u64) -> Instruction {
    let mut data = vec![8u8];
    data.extend_from_slice(&amount.to_le_bytes());
    Instruction {
        program_id: TOKEN_2022,
        accounts: vec![AccountMeta::new(*acc, false), AccountMeta::new(*mint, false), AccountMeta::new_readonly(*owner, true)],
        data,
    }
}
pub fn create_pda<'a>(payer: &AccountInfo<'a>, acc: &AccountInfo<'a>, sys: &AccountInfo<'a>, pid: &Pubkey, seeds: &[&[u8]], len: usize) -> ProgramResult {
    if acc.lamports() > 0 {
        return Err(E::AlreadyInitialized.into());
    }
    let lamports = Rent::get()?.minimum_balance(len);
    invoke_signed(&system_instruction::create_account(payer.key, acc.key, lamports, len as u64, pid), &[payer.clone(), acc.clone(), sys.clone()], &[seeds])
}
pub fn expect_key(a: &AccountInfo, k: &Pubkey) -> ProgramResult {
    if a.key != k {
        msg!("expected {} got {}", k, a.key);
        return Err(E::BadAccount.into());
    }
    Ok(())
}
pub fn signer(a: &AccountInfo) -> ProgramResult {
    if !a.is_signer {
        return Err(E::Unauthorized.into());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    const M0: u64 = 1_005_714_560_286; // SPYx mainnet multiplier
    #[test]
    fn split_recombine_roundtrip() {
        let p = share_value(50_0000_0000, M0, M0).unwrap();
        assert_eq!(p, 50_0000_0000);
        assert_eq!(share_value(p, M0, M0).unwrap(), 50_0000_0000);
    }
    #[test]
    fn claim_is_solvent() {
        let a = 50_0000_0000u64;
        let m1 = 1_007_523_000_000u64;
        let claim = coupon_claim(a, M0, M0, m1).unwrap();
        let share = share_value_up(a, M0, m1).unwrap();
        assert!(claim + share <= a, "vault covers share + coupon");
        assert!(a - claim - share <= 2, "rounding dust only");
        let ui = claim as u128 * m1 as u128 / SCALE;
        let expect = a as u128 * (m1 - M0) as u128 / SCALE;
        assert!(ui.abs_diff(expect) < expect / 100);
    }
    #[test]
    fn no_claim_without_growth() {
        assert_eq!(coupon_claim(100, M0, M0, M0).unwrap(), 0);
    }
    #[test]
    fn swap_constant_product() {
        let (rd, ru) = (1_000_0000_0000u64, 4_100_000_000u64);
        let out = swap_out(20_0000_0000, rd, ru).unwrap();
        assert!(out < 80_392_157 && out > 80_000_000, "{out}");
        assert!((rd + 20_0000_0000) as u128 * (ru - out) as u128 >= rd as u128 * ru as u128, "k never decreases");
    }
    #[test]
    fn swap_empty_pool_errors() {
        assert!(swap_out(1, 0, 10).is_err());
    }
    #[test]
    fn isqrt_works() {
        assert_eq!(isqrt(1_000_000), 1000);
        assert_eq!(isqrt(1_000_001), 1000);
    }
    #[test]
    fn overflow_is_an_error() {
        assert!(share_value(u64::MAX, u64::MAX, 1).is_err());
    }
}
