use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct Bank {
    /// Authority to make changes to Bank State
    pub authority: Pubkey,
    /// Mint address of the asset
    pub mint_address: Pubkey,
    /// Current number of tokens in the bank
    pub total_deposits: u64,
    /// Current number of deposit shares in the bank
    pub total_deposit_shares: u64,
    // Current number of borrowed tokens in the bank
    pub total_borrowed: u64,
    /// Current number of borrowed shares in the bank
    pub total_borrowed_shares: u64,
    /// LTV at which the loan is defined as under collateralized and can be liquidated
    pub liquidation_threshold: u64,
    /// Bonus percentage of collateral that can be liquidated
    pub liquidation_bonus: u64,
    /// Percentage of collateral that can be liquidated
    pub liquidation_close_factor: u64,
    /// Max percentage of collateral that can be borrowed
    pub max_ltv: u64,
    /// Last updated timestamp
    pub last_updated: i64,
    pub interest_rate: u64,
}
