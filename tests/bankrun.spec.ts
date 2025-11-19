import { describe, it } from "node:test";
import IDL from "../target/idl/lending_protocol.json";
import { LendingProtocol } from "../target/types/lending_protocol";
import { BanksClient, ProgramTestContext, startAnchor } from "solana-bankrun";
import { Connection, PublicKey } from "@solana/web3.js";
import { BankrunProvider } from "anchor-bankrun";
import { PythSolanaReceiver } from "@pythnetwork/pyth-solana-receiver";
import { BankrunContextWrapper } from "../bankrun-utils/bankrunConnection";
import { BN, Program } from "@coral-xyz/anchor";
import { Keypair } from "@solana/web3.js";
import { createMint, mintTo, createAccount } from "spl-token-bankrun";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";

describe("Lending Smart Contract Test", async () => {
  let context: ProgramTestContext;
  let provider: BankrunProvider;
  let bankrunContextWrapper: BankrunContextWrapper;
  let program: Program<LendingProtocol>;
  let banksClient: BanksClient;
  let signer: Keypair;
  let usdcBankAccount: PublicKey;
  let solBankAccount: PublicKey;
  let mintUsdc: PublicKey;
  let mintSol: PublicKey;
  let USDCTokenAccount: PublicKey;
  let solUsdPriceFeedAccount: PublicKey;

  const pyth = new PublicKey("HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3");

  const devnetConnection = new Connection("https://api.devnet.solana.com");

  const accountInfo = await devnetConnection.getAccountInfo(pyth);

  context = await startAnchor(
    "",
    [
      {
        name: "lending_protocol",
        programId: new PublicKey(IDL.address),
      },
    ],
    [{ address: pyth, info: accountInfo }]
  );
  provider = new BankrunProvider(context);

  const SOL_PRICE_FEED_ID =
    "0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d";

  bankrunContextWrapper = new BankrunContextWrapper(context);

  const connection = bankrunContextWrapper.connection.toConnection();

  const pythSolanaReceiver = new PythSolanaReceiver({
    connection,
    wallet: provider.wallet,
  });

  solUsdPriceFeedAccount = pythSolanaReceiver.getPriceFeedAccountAddress(
    0,
    SOL_PRICE_FEED_ID
  );

  const feedAccountInfo = await devnetConnection.getAccountInfo(
    solUsdPriceFeedAccount
  );

  context.setAccount(solUsdPriceFeedAccount, feedAccountInfo);

  program = new Program<LendingProtocol>(IDL as LendingProtocol, provider);

  banksClient = context.banksClient;
  signer = provider.wallet.payer;

  mintUsdc = await createMint(banksClient, signer, signer.publicKey, null, 2);

  mintSol = await createMint(banksClient, signer, signer.publicKey, null, 2);

  [usdcBankAccount] = PublicKey.findProgramAddressSync(
    [Buffer.from("treasury"), mintUsdc.toBuffer()],
    program.programId
  );

  [solBankAccount] = PublicKey.findProgramAddressSync(
    [Buffer.from("treasury"), mintSol.toBuffer()],
    program.programId
  );

  it("Test Init and Fund Bank", async () => {
    const initUSdcBankTx = await program.methods
      .initBank(new BN(1), new BN(1))
      .accounts({
        signer: signer.publicKey,
        mint: mintUsdc,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc({ commitment: "confirmed" });

    console.log("Create USDC Bank", initUSdcBankTx);

    const amount = 10_000 * 10 ** 9;

    const mintTx = await mintTo(
      banksClient,
      signer,
      mintUsdc,
      usdcBankAccount,
      signer,
      amount
    );
  });

  it("Test init User", async () => {
    const initUserTx = await program.methods
      .initUser(mintUsdc)
      .accounts({
        signer: signer.publicKey,
      })
      .rpc({ commitment: "confirmed" });
  });

  it("Test Init and fund SOL Bank", async () => {
    const initSolBankTx = await program.methods
      .initBank(new BN(2), new BN(1))
      .accounts({
        signer: signer.publicKey,
        mint: mintSol,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc({ commitment: "confirmed" });

    console.log("Create SOL Bank Account", initSolBankTx);

    const amount = 10_000 * 10 ** 9;

    const mintTx = await mintTo(
      banksClient,
      signer,
      mintSol,
      solBankAccount,
      signer,
      amount
    );
    console.log("Mint SOL to Bank:", mintTx);
  });

  it("Create and Fund Token Account", async () => {
    USDCTokenAccount = await createAccount(
      banksClient,
      signer,
      mintUsdc,
      signer.publicKey
    );
    console.log("USDC Token Account", USDCTokenAccount);

    const amount = 1_000 * 10 ** 9;
    const mintUSDCTx = await mintTo(
      banksClient,
      signer,
      mintUsdc,
      USDCTokenAccount,
      signer,
      amount
    );
    console.log("Mint USDC to User:", mintUSDCTx);
  });

  it("Test Deposit", async () => {
    const deposiUSDC = await program.methods
      .deposit(new BN(100000000000))
      .accounts({
        signer: signer.publicKey,
        mint: mintUsdc,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc({ commitment: "confirmed" });

    console.log("Deposit USDC:", deposiUSDC);
  });

  it("Test Borrow", async () => {
    const borrowSOL = await program.methods
      .borrow(new BN(1))
      .accounts({
        signer: signer.publicKey,
        mint: mintSol,
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
        mint: mintSol,
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
        mint: mintUsdc,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc({ commitment: "confirmed" });

    console.log("Withdraw USDC:", withdrawUSDC);
  });
});
