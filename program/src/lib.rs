//! coupon_vault: split a Token-2022 xStock (ScaledUiAmount) into a share token (p) and a
//! 12 month dividend coupon (d), with a constant product pool per coupon (d/USDC) for trading.
//!
//! Units: every amount is an integer in base units. Multipliers are read from the mint's
//! ScaledUiAmount extension and stored as u64 fixed point with 12 decimals.
//! Share math: p redeems for p * m_base / m raw units, so a share keeps a constant UI value.
//! Coupon math: a d holder claims d * m_base / m_snap * (m - m_snap) / m raw units, which is
//! exactly the raw amount the growing multiplier frees from the share side. The vault stays solvent.

use solana_program::{
    account_info::{next_account_info, AccountInfo},
    clock::Clock,
    entrypoint,
    entrypoint::ProgramResult,
    instruction::{AccountMeta, Instruction},
    msg,
    program::{invoke, invoke_signed},
    program_error::ProgramError,
    pubkey,
    pubkey::Pubkey,
    rent::Rent,
    system_instruction, system_program,
    sysvar::Sysvar,
};

pub const TOKEN_2022: Pubkey = pubkey!("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");
pub const SCALE: u128 = 1_000_000_000_000; // 1e12
pub const YEAR: i64 = 365 * 24 * 3600;
pub const FAUCET_COOLDOWN: i64 = 3600;
pub const FAUCET_X: u64 = 100 * 100_000_000; // 100 tokens at 8 decimals
pub const FAUCET_USDC: u64 = 1_000 * 1_000_000; // 1,000 test USDC at 6 decimals
pub const X_DECIMALS: u8 = 8;
pub const USDC_DECIMALS: u8 = 6;

entrypoint!(process);

#[derive(Debug)]
#[repr(u32)]
pub enum E {
    BadAccount = 1,
    Unauthorized,
    Math,
    Cooldown,
    Matured,
    NotMatured,
    ZeroAmount,
    NoMultiplier,
    Insufficient,
    BadData,
    Slippage,
    EmptyPool,
}
impl From<E> for ProgramError {
    fn from(e: E) -> Self {
        ProgramError::Custom(e as u32)
    }
}

// ---------- state ----------
// Config: admin(32) usdc(32) auth_bump(1) = 65
pub const CONFIG_LEN: usize = 8 + 65;
// Market: x(32) p(32) d(32) m_base(8) m_final(8) start(8) maturity(8) fair_micro(8) bump(1)
pub const MARKET_LEN: usize = 8 + 32 * 3 + 8 * 5 + 1;
// Position: snap(8)
pub const POS_LEN: usize = 8 + 8;
// Drip: last(8)
pub const DRIP_LEN: usize = 8 + 8;
const TAG_CONFIG: &[u8; 8] = b"CPNCONF1";
const TAG_MARKET: &[u8; 8] = b"CPNMKT01";
const TAG_POS: &[u8; 8] = b"CPNPOS01";
const TAG_DRIP: &[u8; 8] = b"CPNDRIP1";

struct Config {
    admin: Pubkey,
    usdc: Pubkey,
    auth_bump: u8,
}
struct Market {
    x: Pubkey,
    p: Pubkey,
    d: Pubkey,
    m_base: u64,
    m_final: u64,
    start: i64,
    maturity: i64,
    fair_micro: u64,
}

fn rd_pk(d: &[u8], o: usize) -> Pubkey {
    Pubkey::new_from_array(d[o..o + 32].try_into().unwrap())
}
fn rd_u64(d: &[u8], o: usize) -> u64 {
    u64::from_le_bytes(d[o..o + 8].try_into().unwrap())
}
fn rd_i64(d: &[u8], o: usize) -> i64 {
    i64::from_le_bytes(d[o..o + 8].try_into().unwrap())
}

fn load_config(a: &AccountInfo, pid: &Pubkey) -> Result<Config, ProgramError> {
    let (k, _) = Pubkey::find_program_address(&[b"config"], pid);
    if a.key != &k || a.owner != pid {
        return Err(E::BadAccount.into());
    }
    let d = a.try_borrow_data()?;
    if &d[..8] != TAG_CONFIG {
        return Err(E::BadAccount.into());
    }
    Ok(Config { admin: rd_pk(&d, 8), usdc: rd_pk(&d, 40), auth_bump: d[72] })
}
fn load_market(a: &AccountInfo, pid: &Pubkey) -> Result<Market, ProgramError> {
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
fn save_market(a: &AccountInfo, m: &Market) -> ProgramResult {
    let mut d = a.try_borrow_mut_data()?;
    d[104..112].copy_from_slice(&m.m_base.to_le_bytes());
    d[112..120].copy_from_slice(&m.m_final.to_le_bytes());
    d[136..144].copy_from_slice(&m.fair_micro.to_le_bytes());
    Ok(())
}

/// Reads the effective ScaledUiAmount multiplier of a Token-2022 mint as 1e12 fixed point.
pub fn read_multiplier(mint: &AccountInfo, now: i64) -> Result<u64, ProgramError> {
    if mint.owner != &TOKEN_2022 {
        return Err(E::BadAccount.into());
    }
    let d = mint.try_borrow_data()?;
    // base mint 82 bytes, padded to 165, then account type byte, then TLV entries
    if d.len() < 166 || d[165] != 1 {
        return Err(E::NoMultiplier.into());
    }
    let mut o = 166;
    while o + 4 <= d.len() {
        let t = u16::from_le_bytes([d[o], d[o + 1]]);
        let l = u16::from_le_bytes([d[o + 2], d[o + 3]]) as usize;
        o += 4;
        if t == 25 && o + l <= d.len() && l >= 56 {
            let cur = f64::from_le_bytes(d[o + 32..o + 40].try_into().unwrap());
            let ts = rd_i64(&d, o + 40);
            let next = f64::from_le_bytes(d[o + 48..o + 56].try_into().unwrap());
            let m = if ts != 0 && now >= ts { next } else { cur };
            if !(m > 0.0) || !m.is_finite() {
                return Err(E::NoMultiplier.into());
            }
            return Ok((m * 1e12) as u64);
        }
        if t == 0 {
            break;
        }
        o += l;
    }
    Err(E::NoMultiplier.into())
}

/// Token account fields: mint at 0, owner at 32, amount at 64.
fn check_ta(a: &AccountInfo, mint: &Pubkey, owner: &Pubkey) -> Result<u64, ProgramError> {
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

// ---------- token CPI helpers ----------
fn ix_transfer(src: &Pubkey, mint: &Pubkey, dst: &Pubkey, auth: &Pubkey, amount: u64, dec: u8) -> Instruction {
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
fn ix_mint_to(mint: &Pubkey, dst: &Pubkey, auth: &Pubkey, amount: u64) -> Instruction {
    let mut data = vec![7u8];
    data.extend_from_slice(&amount.to_le_bytes());
    Instruction {
        program_id: TOKEN_2022,
        accounts: vec![AccountMeta::new(*mint, false), AccountMeta::new(*dst, false), AccountMeta::new_readonly(*auth, true)],
        data,
    }
}
fn ix_burn(acc: &Pubkey, mint: &Pubkey, owner: &Pubkey, amount: u64) -> Instruction {
    let mut data = vec![8u8];
    data.extend_from_slice(&amount.to_le_bytes());
    Instruction {
        program_id: TOKEN_2022,
        accounts: vec![AccountMeta::new(*acc, false), AccountMeta::new(*mint, false), AccountMeta::new_readonly(*owner, true)],
        data,
    }
}

fn create_pda<'a>(
    payer: &AccountInfo<'a>,
    acc: &AccountInfo<'a>,
    sys: &AccountInfo<'a>,
    pid: &Pubkey,
    seeds: &[&[u8]],
    len: usize,
) -> ProgramResult {
    let lamports = Rent::get()?.minimum_balance(len);
    invoke_signed(
        &system_instruction::create_account(payer.key, acc.key, lamports, len as u64, pid),
        &[payer.clone(), acc.clone(), sys.clone()],
        &[seeds],
    )
}

fn cm(a: u128, b: u128) -> Result<u128, ProgramError> {
    a.checked_mul(b).ok_or(E::Math.into())
}
fn cd(a: u128, b: u128) -> Result<u128, ProgramError> {
    a.checked_div(b).ok_or(E::Math.into())
}
fn to64(a: u128) -> Result<u64, ProgramError> {
    u64::try_from(a).map_err(|_| E::Math.into())
}

/// Raw units a share redeems for at multiplier m.
pub fn share_value(amount: u64, m_base: u64, m: u64) -> Result<u64, ProgramError> {
    to64(cd(cm(amount as u128, m_base as u128)?, m as u128)?)
}
/// Raw units a coupon balance can claim when the multiplier moves from snap to m.
pub fn coupon_claim(d_bal: u64, m_base: u64, snap: u64, m: u64) -> Result<u64, ProgramError> {
    if m <= snap || d_bal == 0 {
        return Ok(0);
    }
    let t = cd(cm(d_bal as u128, m_base as u128)?, snap as u128)?;
    to64(cd(cm(t, (m - snap) as u128)?, m as u128)?)
}
// ---------- entry ----------
pub fn process(pid: &Pubkey, accounts: &[AccountInfo], data: &[u8]) -> ProgramResult {
    let (&tag, rest) = data.split_first().ok_or(E::BadData)?;
    let arg_u64 = || -> Result<u64, ProgramError> {
        Ok(u64::from_le_bytes(rest.get(..8).ok_or(E::BadData)?.try_into().unwrap()))
    };
    match tag {
        0 => init_config(pid, accounts),
        1 => init_market(pid, accounts, arg_u64()?, rest.get(8..16).map(|b| i64::from_le_bytes(b.try_into().unwrap())).unwrap_or(YEAR)),
        2 => faucet(pid, accounts),
        3..=8 | 12 | 13 => {
            let g = |i: usize| -> u64 { rest.get(i * 8..i * 8 + 8).map(|b| u64::from_le_bytes(b.try_into().unwrap())).unwrap_or(0) };
            position_ix(pid, accounts, tag, if tag == 5 { 0 } else { arg_u64()? }, g(1), g(2))
        }
        9 => bump(pid, accounts, f64::from_le_bytes(rest.get(..8).ok_or(E::BadData)?.try_into().unwrap())),
        11 => admin_mint(pid, accounts, arg_u64()?),
        _ => Err(E::BadData.into()),
    }
}

/// 0 init_config: [admin s w, config w, usdc_mint, system]
fn init_config(pid: &Pubkey, a: &[AccountInfo]) -> ProgramResult {
    let it = &mut a.iter();
    let admin = next_account_info(it)?;
    let config = next_account_info(it)?;
    let usdc = next_account_info(it)?;
    let sys = next_account_info(it)?;
    if !admin.is_signer {
        return Err(E::Unauthorized.into());
    }
    let (k, b) = Pubkey::find_program_address(&[b"config"], pid);
    if config.key != &k || config.lamports() > 0 {
        return Err(E::BadAccount.into());
    }
    let (_, auth_bump) = Pubkey::find_program_address(&[b"auth"], pid);
    create_pda(admin, config, sys, pid, &[b"config", &[b]], CONFIG_LEN)?;
    let mut d = config.try_borrow_mut_data()?;
    d[..8].copy_from_slice(TAG_CONFIG);
    d[8..40].copy_from_slice(admin.key.as_ref());
    d[40..72].copy_from_slice(usdc.key.as_ref());
    d[72] = auth_bump;
    Ok(())
}

/// 1 init_market(fair_micro, maturity_secs): [admin s w, config, market w, x_mint, p_mint, d_mint, system]
fn init_market(pid: &Pubkey, a: &[AccountInfo], fair: u64, maturity_secs: i64) -> ProgramResult {
    let it = &mut a.iter();
    let admin = next_account_info(it)?;
    let config = next_account_info(it)?;
    let market = next_account_info(it)?;
    let x = next_account_info(it)?;
    let p = next_account_info(it)?;
    let dm = next_account_info(it)?;
    let sys = next_account_info(it)?;
    let cfg = load_config(config, pid)?;
    if !admin.is_signer || admin.key != &cfg.admin {
        return Err(E::Unauthorized.into());
    }
    let (k, b) = Pubkey::find_program_address(&[b"market", x.key.as_ref()], pid);
    if market.key != &k || market.lamports() > 0 {
        return Err(E::BadAccount.into());
    }
    let now = Clock::get()?.unix_timestamp;
    let m = read_multiplier(x, now)?;
    create_pda(admin, market, sys, pid, &[b"market", x.key.as_ref(), &[b]], MARKET_LEN)?;
    let mut d = market.try_borrow_mut_data()?;
    d[..8].copy_from_slice(TAG_MARKET);
    d[8..40].copy_from_slice(x.key.as_ref());
    d[40..72].copy_from_slice(p.key.as_ref());
    d[72..104].copy_from_slice(dm.key.as_ref());
    d[104..112].copy_from_slice(&m.to_le_bytes());
    d[112..120].copy_from_slice(&0u64.to_le_bytes());
    d[120..128].copy_from_slice(&now.to_le_bytes());
    d[128..136].copy_from_slice(&(now + maturity_secs).to_le_bytes());
    d[136..144].copy_from_slice(&fair.to_le_bytes());
    d[144] = b;
    msg!("market {} m_base {}", x.key, m);
    Ok(())
}

/// 2 faucet: [user s w, config, drip w, mint w, user_ata w, auth, token, system, market (for x mints)]
fn faucet(pid: &Pubkey, a: &[AccountInfo]) -> ProgramResult {
    let it = &mut a.iter();
    let user = next_account_info(it)?;
    let config = next_account_info(it)?;
    let drip = next_account_info(it)?;
    let mint = next_account_info(it)?;
    let ata = next_account_info(it)?;
    let auth = next_account_info(it)?;
    let _tok = next_account_info(it)?;
    let sys = next_account_info(it)?;
    let cfg = load_config(config, pid)?;
    if !user.is_signer {
        return Err(E::Unauthorized.into());
    }
    let amount = if mint.key == &cfg.usdc {
        FAUCET_USDC
    } else {
        let market = next_account_info(it)?;
        let m = load_market(market, pid)?;
        if &m.x != mint.key {
            return Err(E::BadAccount.into());
        }
        FAUCET_X
    };
    check_ta(ata, mint.key, user.key)?;
    let now = Clock::get()?.unix_timestamp;
    let (k, b) = Pubkey::find_program_address(&[b"drip", mint.key.as_ref(), user.key.as_ref()], pid);
    if drip.key != &k {
        return Err(E::BadAccount.into());
    }
    if drip.lamports() == 0 {
        create_pda(user, drip, sys, pid, &[b"drip", mint.key.as_ref(), user.key.as_ref(), &[b]], DRIP_LEN)?;
        drip.try_borrow_mut_data()?[..8].copy_from_slice(TAG_DRIP);
    } else {
        let d = drip.try_borrow_data()?;
        if drip.owner != pid || &d[..8] != TAG_DRIP {
            return Err(E::BadAccount.into());
        }
        let last = rd_i64(&d, 8);
        if now < last.checked_add(FAUCET_COOLDOWN).ok_or(E::Math)? {
            msg!("faucet cooldown: {}s left", last + FAUCET_COOLDOWN - now);
            return Err(E::Cooldown.into());
        }
    }
    drip.try_borrow_mut_data()?[8..16].copy_from_slice(&now.to_le_bytes());
    invoke_signed(
        &ix_mint_to(mint.key, ata.key, auth.key, amount),
        &[mint.clone(), ata.clone(), auth.clone()],
        &[&[b"auth", &[cfg.auth_bump]]],
    )
}

/// Pool state: tag(8) market(32) lp_mint(32) bump(1)
pub const POOL_LEN: usize = 8 + 32 + 32 + 1;
const TAG_POOL: &[u8; 8] = b"CPNPOOL1";
pub const FEE_BPS: u128 = 30; // 0.30% swap fee, stays in the pool for LPs

/// Constant product output for an exact input, fee taken on the input side.
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

/// 3 split, 4 recombine, 5 claim, 6 redeem, 7 swap_sell (d -> usdc), 8 swap_buy (usdc -> d),
/// 12 add_liquidity, 13 remove_liquidity. All share one account list:
/// [0 user s w, 1 config, 2 market w, 3 pos w, 4 x_mint, 5 p_mint w, 6 d_mint w, 7 usdc_mint,
///  8 user_x w, 9 user_p w, 10 user_d w, 11 user_usdc w, 12 vault w, 13 pool w, 14 pool_d w,
///  15 pool_usdc w, 16 lp_mint w, 17 user_lp w, 18 auth, 19 token, 20 system]
fn position_ix(pid: &Pubkey, a: &[AccountInfo], tag: u8, amount: u64, arg2: u64, arg3: u64) -> ProgramResult {
    if a.len() < 21 {
        return Err(ProgramError::NotEnoughAccountKeys);
    }
    let (user, config, market, pos, x, p, dm, usdc) = (&a[0], &a[1], &a[2], &a[3], &a[4], &a[5], &a[6], &a[7]);
    let (ux, up, ud, uu, vault) = (&a[8], &a[9], &a[10], &a[11], &a[12]);
    let (pool, pool_d, pool_u, lp, ulp, auth, tok, sys) = (&a[13], &a[14], &a[15], &a[16], &a[17], &a[18], &a[19], &a[20]);
    if !user.is_signer {
        return Err(E::Unauthorized.into());
    }
    if tag != 5 && amount == 0 {
        return Err(E::ZeroAmount.into());
    }
    let cfg = load_config(config, pid)?;
    let mut mk = load_market(market, pid)?;
    if x.key != &mk.x || p.key != &mk.p || dm.key != &mk.d || usdc.key != &cfg.usdc {
        return Err(E::BadAccount.into());
    }
    let (ak, _) = Pubkey::find_program_address(&[b"auth"], pid);
    if auth.key != &ak || sys.key != &system_program::ID || tok.key != &TOKEN_2022 {
        return Err(E::BadAccount.into());
    }
    let signer: &[&[u8]] = &[b"auth", &[cfg.auth_bump]];
    check_ta(ux, x.key, user.key)?;
    check_ta(up, p.key, user.key)?;
    let d_bal = check_ta(ud, dm.key, user.key)?;
    check_ta(vault, x.key, auth.key)?;

    // effective multiplier: live until maturity, then frozen at the first read after maturity
    let now = Clock::get()?.unix_timestamp;
    let matured = now >= mk.maturity;
    let m = if matured {
        if mk.m_final == 0 {
            mk.m_final = read_multiplier(x, now)?;
            save_market(market, &mk)?;
        }
        mk.m_final
    } else {
        read_multiplier(x, now)?
    };
    if matured && matches!(tag, 3 | 7 | 8 | 12) {
        return Err(E::Matured.into());
    }
    if tag == 6 && !matured {
        return Err(E::NotMatured.into());
    }

    // position: create on first touch with snap = m, else settle pending coupon income first,
    // so every change to a wallet's coupon balance starts from a fresh snapshot
    let (pk, pb) = Pubkey::find_program_address(&[b"pos", market.key.as_ref(), user.key.as_ref()], pid);
    if pos.key != &pk {
        return Err(E::BadAccount.into());
    }
    let mut claimed = 0u64;
    if pos.lamports() == 0 {
        create_pda(user, pos, sys, pid, &[b"pos", market.key.as_ref(), user.key.as_ref(), &[pb]], POS_LEN)?;
        pos.try_borrow_mut_data()?[..8].copy_from_slice(TAG_POS);
    } else {
        if pos.owner != pid || &pos.try_borrow_data()?[..8] != TAG_POS {
            return Err(E::BadAccount.into());
        }
        let snap = rd_u64(&pos.try_borrow_data()?, 8);
        claimed = coupon_claim(d_bal, mk.m_base, snap, m)?;
        if claimed > 0 {
            invoke_signed(
                &ix_transfer(vault.key, x.key, ux.key, auth.key, claimed, X_DECIMALS),
                &[vault.clone(), x.clone(), ux.clone(), auth.clone()],
                &[signer],
            )?;
        }
    }
    pos.try_borrow_mut_data()?[8..16].copy_from_slice(&m.to_le_bytes());
    if tag == 5 || claimed > 0 {
        msg!("event:claim market={} user={} raw={} m={}", x.key, user.key, claimed, m);
    }

    match tag {
        3 => {
            if check_ta(ux, x.key, user.key)? < amount {
                return Err(E::Insufficient.into());
            }
            invoke(&ix_transfer(ux.key, x.key, vault.key, user.key, amount, X_DECIMALS), &[ux.clone(), x.clone(), vault.clone(), user.clone()])?;
            let minted = share_value(amount, m, mk.m_base)?; // p with p * m_base / m == amount
            for (mint, dst) in [(p, up), (dm, ud)] {
                invoke_signed(&ix_mint_to(mint.key, dst.key, auth.key, minted), &[mint.clone(), dst.clone(), auth.clone()], &[signer])?;
            }
            msg!("event:split market={} user={} in={} p={} d={} m={}", x.key, user.key, amount, minted, minted, m);
        }
        4 | 6 => {
            if check_ta(up, p.key, user.key)? < amount || (tag == 4 && d_bal < amount) {
                return Err(E::Insufficient.into());
            }
            invoke(&ix_burn(up.key, p.key, user.key, amount), &[up.clone(), p.clone(), user.clone()])?;
            if tag == 4 {
                invoke(&ix_burn(ud.key, dm.key, user.key, amount), &[ud.clone(), dm.clone(), user.clone()])?;
            }
            let out = share_value(amount, mk.m_base, m)?;
            invoke_signed(&ix_transfer(vault.key, x.key, ux.key, auth.key, out, X_DECIMALS), &[vault.clone(), x.clone(), ux.clone(), auth.clone()], &[signer])?;
            msg!("event:{} market={} user={} burned={} out={} m={}", if tag == 4 { "recombine" } else { "redeem" }, x.key, user.key, amount, out, m);
        }
        5 => {}
        7 | 8 | 12 | 13 => pool_ix(pid, &cfg, market, tag, amount, arg2, arg3, user, dm, usdc, ud, uu, pool, pool_d, pool_u, lp, ulp, sys, d_bal)?,
        _ => return Err(E::BadData.into()),
    }
    Ok(())
}

#[allow(clippy::too_many_arguments)]
fn pool_ix<'a>(
    pid: &Pubkey,
    cfg: &Config,
    market: &AccountInfo<'a>,
    tag: u8,
    amount: u64,
    arg2: u64,
    arg3: u64,
    user: &AccountInfo<'a>,
    dm: &AccountInfo<'a>,
    usdc: &AccountInfo<'a>,
    ud: &AccountInfo<'a>,
    uu: &AccountInfo<'a>,
    pool: &AccountInfo<'a>,
    pool_d: &AccountInfo<'a>,
    pool_u: &AccountInfo<'a>,
    lp: &AccountInfo<'a>,
    ulp: &AccountInfo<'a>,
    sys: &AccountInfo<'a>,
    d_bal: u64,
) -> ProgramResult {
    let (pk, pb) = Pubkey::find_program_address(&[b"pool", market.key.as_ref()], pid);
    if pool.key != &pk {
        return Err(E::BadAccount.into());
    }
    let pseeds: &[&[u8]] = &[b"pool", market.key.as_ref(), &[pb]];
    let u_bal = check_ta(uu, usdc.key, user.key)?;
    let fresh = pool.lamports() == 0;
    if fresh {
        // only the admin may open a pool, with the seed liquidity that sets the opening price
        if tag != 12 || user.key != &cfg.admin {
            return Err(E::EmptyPool.into());
        }
        create_pda(user, pool, sys, pid, pseeds, POOL_LEN)?;
        let mut d = pool.try_borrow_mut_data()?;
        d[..8].copy_from_slice(TAG_POOL);
        d[8..40].copy_from_slice(market.key.as_ref());
        d[40..72].copy_from_slice(lp.key.as_ref());
        d[72] = pb;
    } else {
        let d = pool.try_borrow_data()?;
        if pool.owner != pid || &d[..8] != TAG_POOL || &rd_pk(&d, 40) != lp.key {
            return Err(E::BadAccount.into());
        }
    }
    let rd = check_ta(pool_d, dm.key, pool.key)?;
    let ru = check_ta(pool_u, usdc.key, pool.key)?;
    // lp mint: authority must be the pool, supply at offset 36
    if lp.owner != &TOKEN_2022 {
        return Err(E::BadAccount.into());
    }
    let (lp_auth, supply) = {
        let d = lp.try_borrow_data()?;
        if d.len() < 82 || u32::from_le_bytes(d[0..4].try_into().unwrap()) != 1 {
            return Err(E::BadAccount.into());
        }
        (rd_pk(&d, 4), rd_u64(&d, 36))
    };
    if &lp_auth != pool.key {
        return Err(E::BadAccount.into());
    }
    check_ta(ulp, lp.key, user.key)?;
    let psign: &[&[u8]] = pseeds;
    let min_out = arg2;
    match tag {
        7 => {
            if d_bal < amount {
                return Err(E::Insufficient.into());
            }
            let out = swap_out(amount, rd, ru)?;
            if out < min_out || out == 0 {
                return Err(E::Slippage.into());
            }
            invoke(&ix_transfer(ud.key, dm.key, pool_d.key, user.key, amount, X_DECIMALS), &[ud.clone(), dm.clone(), pool_d.clone(), user.clone()])?;
            invoke_signed(&ix_transfer(pool_u.key, usdc.key, uu.key, pool.key, out, USDC_DECIMALS), &[pool_u.clone(), usdc.clone(), uu.clone(), pool.clone()], &[psign])?;
            msg!("event:swap side=sell user={} d_in={} usdc_out={} reserves_d={} reserves_usdc={}", user.key, amount, out, rd + amount, ru - out);
        }
        8 => {
            if u_bal < amount {
                return Err(E::Insufficient.into());
            }
            let out = swap_out(amount, ru, rd)?;
            if out < min_out || out == 0 {
                return Err(E::Slippage.into());
            }
            invoke(&ix_transfer(uu.key, usdc.key, pool_u.key, user.key, amount, USDC_DECIMALS), &[uu.clone(), usdc.clone(), pool_u.clone(), user.clone()])?;
            invoke_signed(&ix_transfer(pool_d.key, dm.key, ud.key, pool.key, out, X_DECIMALS), &[pool_d.clone(), dm.clone(), ud.clone(), pool.clone()], &[psign])?;
            msg!("event:swap side=buy user={} usdc_in={} d_out={} reserves_d={} reserves_usdc={}", user.key, amount, out, rd - out, ru + amount);
        }
        12 => {
            // add_liquidity(d_amount, usdc_max, min_lp)
            let (u_in, minted) = if fresh || supply == 0 {
                (arg2, to64(isqrt(cm(amount as u128, arg2 as u128)?))?)
            } else {
                let u_need = cd(cm(amount as u128, ru as u128)?.checked_add(rd as u128 - 1).ok_or(E::Math)?, rd as u128)?;
                (to64(u_need)?, to64(cd(cm(amount as u128, supply as u128)?, rd as u128)?)?)
            };
            if u_in > arg2 || minted < arg3 || minted == 0 {
                return Err(E::Slippage.into());
            }
            if d_bal < amount || u_bal < u_in {
                return Err(E::Insufficient.into());
            }
            invoke(&ix_transfer(ud.key, dm.key, pool_d.key, user.key, amount, X_DECIMALS), &[ud.clone(), dm.clone(), pool_d.clone(), user.clone()])?;
            invoke(&ix_transfer(uu.key, usdc.key, pool_u.key, user.key, u_in, USDC_DECIMALS), &[uu.clone(), usdc.clone(), pool_u.clone(), user.clone()])?;
            invoke_signed(&ix_mint_to(lp.key, ulp.key, pool.key, minted), &[lp.clone(), ulp.clone(), pool.clone()], &[psign])?;
            msg!("event:add_liquidity user={} d_in={} usdc_in={} lp={}", user.key, amount, u_in, minted);
        }
        13 => {
            // remove_liquidity(lp_amount, min_d, min_usdc)
            if supply == 0 {
                return Err(E::EmptyPool.into());
            }
            let d_out = to64(cd(cm(amount as u128, rd as u128)?, supply as u128)?)?;
            let u_out = to64(cd(cm(amount as u128, ru as u128)?, supply as u128)?)?;
            if d_out < arg2 || u_out < arg3 {
                return Err(E::Slippage.into());
            }
            invoke(&ix_burn(ulp.key, lp.key, user.key, amount), &[ulp.clone(), lp.clone(), user.clone()])?;
            invoke_signed(&ix_transfer(pool_d.key, dm.key, ud.key, pool.key, d_out, X_DECIMALS), &[pool_d.clone(), dm.clone(), ud.clone(), pool.clone()], &[psign])?;
            invoke_signed(&ix_transfer(pool_u.key, usdc.key, uu.key, pool.key, u_out, USDC_DECIMALS), &[pool_u.clone(), usdc.clone(), uu.clone(), pool.clone()], &[psign])?;
            msg!("event:remove_liquidity user={} lp={} d_out={} usdc_out={}", user.key, amount, d_out, u_out);
        }
        _ => return Err(E::BadData.into()),
    }
    Ok(())
}


/// 9 bump(new_multiplier f64): [admin s, config, market, x_mint w, auth, token]
fn bump(pid: &Pubkey, a: &[AccountInfo], nm: f64) -> ProgramResult {
    let it = &mut a.iter();
    let admin = next_account_info(it)?;
    let config = next_account_info(it)?;
    let market = next_account_info(it)?;
    let x = next_account_info(it)?;
    let auth = next_account_info(it)?;
    let _tok = next_account_info(it)?;
    let cfg = load_config(config, pid)?;
    if !admin.is_signer || admin.key != &cfg.admin {
        return Err(E::Unauthorized.into());
    }
    let mk = load_market(market, pid)?;
    if x.key != &mk.x {
        return Err(E::BadAccount.into());
    }
    let now = Clock::get()?.unix_timestamp;
    let cur = read_multiplier(x, now)?;
    if !(nm.is_finite()) || ((nm * 1e12) as u64) <= cur {
        return Err(E::BadData.into());
    }
    let mut data = vec![43u8, 1u8];
    data.extend_from_slice(&nm.to_le_bytes());
    data.extend_from_slice(&now.to_le_bytes());
    let ix = Instruction {
        program_id: TOKEN_2022,
        accounts: vec![AccountMeta::new(*x.key, false), AccountMeta::new_readonly(*auth.key, true)],
        data,
    };
    invoke_signed(&ix, &[x.clone(), auth.clone()], &[&[b"auth", &[cfg.auth_bump]]])?;
    msg!("bump {} -> {}", cur, (nm * 1e12) as u64);
    Ok(())
}

/// 11 admin_mint(amount): [admin s, config, mint w, dst w, auth, token]
fn admin_mint(pid: &Pubkey, a: &[AccountInfo], amount: u64) -> ProgramResult {
    let it = &mut a.iter();
    let admin = next_account_info(it)?;
    let config = next_account_info(it)?;
    let mint = next_account_info(it)?;
    let dst = next_account_info(it)?;
    let auth = next_account_info(it)?;
    let cfg = load_config(config, pid)?;
    if !admin.is_signer || admin.key != &cfg.admin {
        return Err(E::Unauthorized.into());
    }
    invoke_signed(&ix_mint_to(mint.key, dst.key, auth.key, amount), &[mint.clone(), dst.clone(), auth.clone()], &[&[b"auth", &[cfg.auth_bump]]])
}

#[cfg(test)]
mod tests {
    use super::*;
    const M0: u64 = 1_005_714_560_286; // SPYx mainnet multiplier, 1e12
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
        let share = share_value(a, M0, m1).unwrap();
        assert!(claim + share <= a, "vault must cover share + coupon");
        assert!(a - claim - share <= 1, "rounding dust only");
        // UI value of the claim is about amount * (m1 - m0)
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
        // pool: 1,000 d and $4,100 USDC. Selling 20 d.
        let rd = 1_000_0000_0000u64;
        let ru = 4_100_000_000u64;
        let out = swap_out(20_0000_0000, rd, ru).unwrap();
        // no-fee output would be 4100*20/1020 = 80.392; fee 0.3% trims it
        assert!(out < 80_392_157 && out > 80_000_000, "{out}");
        // k never decreases
        let k0 = rd as u128 * ru as u128;
        let k1 = (rd + 20_0000_0000) as u128 * (ru - out) as u128;
        assert!(k1 >= k0);
    }
    #[test]
    fn swap_empty_pool_errors() {
        assert!(swap_out(1, 0, 10).is_err());
    }
    #[test]
    fn isqrt_works() {
        assert_eq!(isqrt(1_000_000), 1000);
        assert_eq!(isqrt(1_000_001), 1000);
        assert_eq!(isqrt(0), 0);
    }
}
