use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
    #[msg("Insufficient funds to withdraw.")]
    InsufficientFunds,
    #[msg("Requested Amount exceeds hte borrow amount")]
    OverBorrowableAmount,
    #[msg("Requested Amount exceeds depositable amount")]
    OverRepay,
    #[msg("User is not under collateralized, can't be Liquidated")]
    NotUndercollateralized,
}
