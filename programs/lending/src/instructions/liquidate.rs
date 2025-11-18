use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token_interface::{ self, Mint, TokenAccount, TokenInterface, TransferChecked };
use pyth_solana_receiver_sdk::price_update::get_feed_id_from_hex;
use crate::constants::{MAXIMUM_AGE, SOL_USD_FEED_ID, USDC_USD_FEED_ID};
use crate::state::*;
use crate::error::ErrorCode;

#[derive(Accounts)]
pub struct Liquidate<'info> {
    #[account(mut)]
    pub liquidator: Signer<'info>,
    /// CHECK: This account is validated by the Pyth SDK
    pub price_update: AccountInfo<'info>,
    pub collateral_mint: InterfaceAccount<'info, Mint>,
    pub borrowed_mint: InterfaceAccount<'info, Mint>,
    #[account(
        mut, 
        seeds = [collateral_mint.key().as_ref()],
        bump,
    )]  
    pub collateral_bank: Account<'info, Bank>,
    #[account(
        mut, 
        seeds = [b"treasury", collateral_mint.key().as_ref()],
        bump, 
    )]  
    pub collateral_bank_token_account: InterfaceAccount<'info, TokenAccount>,
    #[account(
        mut, 
        seeds = [borrowed_mint.key().as_ref()],
        bump,
    )]  
    pub borrowed_bank: Account<'info, Bank>,
    #[account(
        mut, 
        seeds = [b"treasury", borrowed_mint.key().as_ref()],
        bump, 
    )]  
    pub borrowed_bank_token_account: InterfaceAccount<'info, TokenAccount>,
    #[account(
        mut, 
        seeds = [liquidator.key().as_ref()],
        bump,
    )]  
    pub user_account: Account<'info, User>,
    #[account( 
        init_if_needed, 
        payer = liquidator,
        associated_token::mint = collateral_mint, 
        associated_token::authority = liquidator,
        associated_token::token_program = token_program,
    )]
    pub liquidator_collateral_token_account: InterfaceAccount<'info, TokenAccount>, 
    #[account( 
        init_if_needed, 
        payer = liquidator,
        associated_token::mint = borrowed_mint, 
        associated_token::authority = liquidator,
        associated_token::token_program = token_program,
    )]
    pub liquidator_borrowed_token_account: InterfaceAccount<'info, TokenAccount>, 
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn process_liquidate(ctx: Context<Liquidate>) -> Result<()> { 
    let collateral_bank = &mut ctx.accounts.collateral_bank;
    let user = &mut ctx.accounts.user_account;

    let price_update = &ctx.accounts.price_update;

    let sol_feed_id = get_feed_id_from_hex(SOL_USD_FEED_ID).unwrap(); 
    let usdc_feed_id = get_feed_id_from_hex(USDC_USD_FEED_ID).unwrap();
    
    let price_update_data = price_update.try_borrow_data()?;
    let price_update_account = pyth_solana_receiver_sdk::price_update::PriceUpdateV2::deserialize(&mut &price_update_data[8..])?;
    
    let sol_price = price_update_account.get_price_no_older_than(&Clock::get()?, MAXIMUM_AGE, &sol_feed_id).unwrap();
    let usdc_price = price_update_account.get_price_no_older_than(&Clock::get()?, MAXIMUM_AGE, &usdc_feed_id).unwrap();

    // Note: For simplicity, interest is not being included in these calculations. 

    let total_collateral = (sol_price.price as u64 * user.deposited_sol) + (usdc_price.price as u64 * user.deposited_usdc);
    let total_borrowed = (sol_price.price as u64 * user.borrowed_sol) + (usdc_price.price as u64 * user.borrowed_usdc);    

    let health_factor = (total_collateral * collateral_bank.liquidation_threshold)/total_borrowed;

    if health_factor >= 1 {
        return Err(ErrorCode::NotUndercollateralized.into());
    }

    let liquidation_amount = total_borrowed * collateral_bank.liquidation_close_factor;

    // liquidator pays back the borrowed amount back to the bank 

    let transfer_to_bank = TransferChecked {
        from: ctx.accounts.liquidator_borrowed_token_account.to_account_info(),
        mint: ctx.accounts.borrowed_mint.to_account_info(),
        to: ctx.accounts.borrowed_bank_token_account.to_account_info(),
        authority: ctx.accounts.liquidator.to_account_info(),
    };

    let cpi_program = ctx.accounts.token_program.to_account_info();
    let cpi_ctx_to_bank = CpiContext::new(cpi_program.clone(), transfer_to_bank);
    let decimals = ctx.accounts.borrowed_mint.decimals;

    token_interface::transfer_checked(cpi_ctx_to_bank, liquidation_amount, decimals)?;

    // Transfer liquidation value and bonus to liquidator
    let liquidation_bonus = (liquidation_amount * collateral_bank.liquidation_bonus) + liquidation_amount;
    
    let transfer_to_liquidator = TransferChecked {
        from: ctx.accounts.collateral_bank_token_account.to_account_info(),
        mint: ctx.accounts.collateral_mint.to_account_info(),
        to: ctx.accounts.liquidator_collateral_token_account.to_account_info(),
        authority: ctx.accounts.collateral_bank_token_account.to_account_info(),
    };

    let mint_key = ctx.accounts.collateral_mint.key();
    let signer_seeds: &[&[&[u8]]] = &[
        &[
            b"treasury",
            mint_key.as_ref(),
            &[ctx.bumps.collateral_bank_token_account],
        ],
    ];
    let cpi_ctx_to_liquidator = CpiContext::new(cpi_program.clone(), transfer_to_liquidator).with_signer(signer_seeds);
    let collateral_decimals = ctx.accounts.collateral_mint.decimals;   
    token_interface::transfer_checked(cpi_ctx_to_liquidator, liquidation_bonus, collateral_decimals)?;

    Ok(())
}