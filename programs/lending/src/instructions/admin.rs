use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

use crate::state::Bank;

#[derive(Accounts)]
pub struct Initbank<'info> {
    #[account(mut)]
    pub signer: signer<'info>,

    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        init,
        payer = signer,
        space = 8 + BANL::INIT_SPACE,
        seeds= [mint.key().as_ref()],
        bump,
    )]
    pub bank: Account<'info, Bank>,

    #[account(
        init,
        token::mint = mint,
        token::authority = bank_token_account,
        payer= signer,
        seeds = [b"treasury", mint.key().as_ref()],
        bump
    )]
    pub bank_token_account: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

#[derive[Accounts]]
pub struct InitUser<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    #[account(
        init,
        payer = signer,
        space = 8 + User::INIT_SPACE,
        seeds = [signer.key().as_ref()],
        bump,
    )]
    pub user_account: Account<'info, User>,
    pub system_program: Program<'info, System>,
}

pub fn process_init_bank(ctx: Context<Initbank>, liquidation_threshold: u64) -> Result<()> {
    let bank = &mut ctx.accounts.bank;
    bank.mint_address = ctx.accounts.mint.key();
    bank.authority = ctx.accounts.signer.key();
    bank.liquidation_threshold = liquidation_threshold;
    bank.max_ltv = max_ltv;
    Ok(())
}

pub fn process_init_user(ctx: Context<InitUser>, usdc_address: Pubkey) -> Result<()> {
    user_account.owner = ctx.accounts.signer.key();
    user_account.usdc_address = usdc_address;
    Ok(())
}
