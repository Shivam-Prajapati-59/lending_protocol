import { describe, it, before } from "node:test";
import { BN, Program } from "@coral-xyz/anchor";
import { BankrunProvider } from "anchor-bankrun";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { createAccount, createMint, mintTo } from "spl-token-bankrun";
import { PythSolanaReceiver } from "@pythnetwork/pyth-solana-receiver";
import { startAnchor, BanksClient, ProgramTestContext } from "solana-bankrun";
import { PublicKey, Keypair, Connection } from "@solana/web3.js";
import { LendingProtocol } from "../target/types/lending_protocol";
import { BankrunContextWrapper } from "../bankrun-utils/bankrunConnection";

const IDL = require("../target/idl/lending_protocol.json");

describe("Lending Smart Contract Test", () => {
  let context: ProgramTestContext;
  let provider: BankrunProvider;
  let bankrunContextWrapper: BankrunContextWrapper;
  let program: Program<LendingProtocol>;
  let banksClient: BanksClient;
  let signer: Keypair;
  let usdcBankAccount: PublicKey;
  let solBankAccount: PublicKey;
  let mintUSDC: PublicKey;
  let mintSOL: PublicKey;
  let USDCTokenAccount: PublicKey;
  let solUsdPriceFeedAccount: PublicKey;

  before(async () => {
    const pyth = new PublicKey("HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3");
    const devnetConnection = new Connection("https://api.devnet.solana.com");

    let accountInfo;
    try {
      accountInfo = await devnetConnection.getAccountInfo(pyth);
    } catch (error) {
      console.log(
        "Warning: Could not fetch Pyth account from devnet, using mock data"
      );
      accountInfo = null;
    }

    const accounts = accountInfo ? [{ address: pyth, info: accountInfo }] : [];

    context = await startAnchor(
      "",
      [{ name: "lending", programId: new PublicKey(IDL.address) }],
      accounts
    );

    provider = new BankrunProvider(context);
    bankrunContextWrapper = new BankrunContextWrapper(context);
    const connection = bankrunContextWrapper.connection.toConnection();

    const pythSolanaReceiver = new PythSolanaReceiver({
      connection,
      wallet: provider.wallet,
    });

    const SOL_PRICE_FEED_ID =
      "0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d";

    const solUsdPriceFeedAccountPubkey =
      pythSolanaReceiver.getPriceFeedAccountAddress(0, SOL_PRICE_FEED_ID);

    let feedAccountInfo;
    try {
      feedAccountInfo = await devnetConnection.getAccountInfo(
        solUsdPriceFeedAccountPubkey
      );
    } catch (error) {
      console.log("Warning: Could not fetch price feed account from devnet");
      feedAccountInfo = null;
    }

    if (feedAccountInfo) {
      context.setAccount(solUsdPriceFeedAccountPubkey, feedAccountInfo);
    }

    solUsdPriceFeedAccount = solUsdPriceFeedAccountPubkey;

    program = new Program<LendingProtocol>(IDL as LendingProtocol, provider);
    banksClient = context.banksClient;
    signer = provider.wallet.payer;

    mintUSDC = await createMint(banksClient, signer, signer.publicKey, null, 2);

    mintSOL = await createMint(banksClient, signer, signer.publicKey, null, 2);

    [usdcBankAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from("treasury"), mintUSDC.toBuffer()],
      program.programId
    );

    [solBankAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from("treasury"), mintSOL.toBuffer()],
      program.programId
    );

    console.log("USDC Bank Account:", usdcBankAccount.toBase58());
    console.log("SOL Bank Account:", solBankAccount.toBase58());
  });

  it("Test Init User", async () => {
    const initUserTx = await program.methods
      .initUser(mintUSDC)
      .accounts({
        signer: signer.publicKey,
      })
      .rpc({ commitment: "confirmed" });

    console.log("Create User Account:", initUserTx);
  });

  it("Test Init and Fund USDC Bank", async () => {
    const initUSDCBankTx = await program.methods
      .initBank(new BN(1), new BN(1))
      .accounts({
        signer: signer.publicKey,
        mint: mintUSDC,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc({ commitment: "confirmed" });

    console.log("Create USDC Bank Account:", initUSDCBankTx);

    const amount = 10_000 * 10 ** 9;
    const mintTx = await mintTo(
      banksClient,
      signer,
      mintUSDC,
      usdcBankAccount,
      signer,
      amount
    );

    console.log("Mint to USDC Bank Signature:", mintTx);
  });

  it("Test Init and Fund SOL Bank", async () => {
    const initSOLBankTx = await program.methods
      .initBank(new BN(1), new BN(1))
      .accounts({
        signer: signer.publicKey,
        mint: mintSOL,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc({ commitment: "confirmed" });

    console.log("Create SOL Bank Account:", initSOLBankTx);

    const amount = 10_000 * 10 ** 9;
    const mintSOLTx = await mintTo(
      banksClient,
      signer,
      mintSOL,
      solBankAccount,
      signer,
      amount
    );

    console.log("Mint to SOL Bank Signature:", mintSOLTx);
  });

  it("Create and Fund Token Account", async () => {
    USDCTokenAccount = await createAccount(
      banksClient,
      signer,
      mintUSDC,
      signer.publicKey
    );

    console.log("USDC Token Account Created:", USDCTokenAccount.toBase58());

    const amount = 10_000 * 10 ** 9;
    const mintUSDCTx = await mintTo(
      banksClient,
      signer,
      mintUSDC,
      USDCTokenAccount,
      signer,
      amount
    );

    console.log("Mint to User USDC Account Signature:", mintUSDCTx);
  });

  it("Test Deposit", async () => {
    const depositUSDC = await program.methods
      .deposit(new BN(100000000000))
      .accounts({
        signer: signer.publicKey,
        mint: mintUSDC,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc({ commitment: "confirmed" });

    console.log("Deposit USDC:", depositUSDC);
  });

  it("Test Borrow", async () => {
    const borrowSOL = await program.methods
      .borrow(new BN(1))
      .accounts({
        signer: signer.publicKey,
        mint: mintSOL,
        tokenProgram: TOKEN_PROGRAM_ID,
        priceUpdate: solUsdPriceFeedAccount,
      })
      .rpc({ commitment: "confirmed" });

    console.log("Borrow SOL:", borrowSOL);
  });

  it("Test Repay", async () => {
    const repaySOL = await program.methods
      .repay(new BN(1))
      .accounts({
        signer: signer.publicKey,
        mint: mintSOL,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc({ commitment: "confirmed" });

    console.log("Repay SOL:", repaySOL);
  });

  it("Test Withdraw", async () => {
    const withdrawUSDC = await program.methods
      .withdraw(new BN(100))
      .accounts({
        signer: signer.publicKey,
        mint: mintUSDC,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc({ commitment: "confirmed" });

    console.log("Withdraw USDC:", withdrawUSDC);
  });
});
