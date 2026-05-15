/**
 * tests/contracts/GenesisVault.test.ts
 * Genesis Reserve — Core Contract Test Suite
 *
 * Coverage targets (85%+):
 *   GenesisVault:        deposit, reserve, finalize, release, fee, emergency
 *   StrategyRouter:      register, allocate, unwind, harvest, concentration caps
 *   ComplianceRegistry:  activate, screen, sanction, travel rule, jurisdiction
 *
 * Run: npx hardhat test tests/contracts/GenesisVault.test.ts --network hardhat
 */

import { expect } from "chai";
import { ethers } from "hardhat";
import { Signer, Contract, BigNumber } from "ethers";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";

// ─── CONSTANTS ───────────────────────────────────────────────────────────────
const USDC_DECIMALS    = 6;
const ONE_USDC         = ethers.utils.parseUnits("1", USDC_DECIMALS);
const THOUSAND_USDC    = ethers.utils.parseUnits("1000", USDC_DECIMALS);
const TEN_K_USDC       = ethers.utils.parseUnits("10000", USDC_DECIMALS);
const ONE_DAY          = 86400;
const COMPLIANCE_PASS  = ethers.utils.formatBytes32String("PASS");
const COMPLIANCE_BLOCK = ethers.utils.formatBytes32String("BLOCKED");

// ─── FIXTURE ─────────────────────────────────────────────────────────────────

async function deployGenesisFixture() {
  const [owner, operator, guardian, user1, user2, feeRecipient, partnerRecipient, alice, bob] =
    await ethers.getSigners();

  // 1. Deploy mock USDC
  const MockERC20 = await ethers.getContractFactory("MockERC20");
  const usdc = await MockERC20.deploy("USD Coin", "USDC", 6);
  await usdc.deployed();

  // 2. Deploy mock ComplianceRegistry
  const ComplianceRegistry = await ethers.getContractFactory("ComplianceRegistry");
  const compliance = await ComplianceRegistry.deploy(owner.address);
  await compliance.deployed();

  // 3. Deploy mock StrategyRouter (stub for unit tests)
  const MockStrategyRouter = await ethers.getContractFactory("MockStrategyRouter");
  const router = await MockStrategyRouter.deploy(usdc.address, owner.address);
  await router.deployed();

  // 4. Deploy GenesisVault
  const GenesisVault = await ethers.getContractFactory("GenesisVault");
  const vault = await GenesisVault.deploy(
    usdc.address,
    router.address,
    compliance.address,
    feeRecipient.address,
    partnerRecipient.address,
    owner.address
  );
  await vault.deployed();

  // 5. Grant roles
  const OPERATOR_ROLE    = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("OPERATOR_ROLE"));
  const COMPLIANCE_WRITE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("COMPLIANCE_WRITER"));
  await vault.grantRole(OPERATOR_ROLE, operator.address);
  await compliance.grantRole(COMPLIANCE_WRITE, operator.address);

  // 6. Activate test accounts in ComplianceRegistry
  const activateUser = async (addr: string) => {
    await compliance.connect(operator).activateAccount(
      addr, 2, 1, "US", false,
      (await time.latest()) + ONE_DAY * 365,
      ethers.utils.formatBytes32String("kyc-ref"),
      ethers.utils.formatBytes32String("aml-ref")
    );
  };
  await activateUser(user1.address);
  await activateUser(user2.address);
  await activateUser(alice.address);

  // 7. Activate vault accounts
  await vault.connect(operator).activateAccount(user1.address, 0, 2, false); // FlexibleReserve
  await vault.connect(operator).activateAccount(user2.address, 1, 2, false); // IncomeVault
  await vault.connect(operator).activateAccount(alice.address, 2, 3, false); // GrowthMode

  // 8. Mint USDC to users
  await usdc.mint(user1.address, TEN_K_USDC);
  await usdc.mint(user2.address, TEN_K_USDC);
  await usdc.mint(alice.address, TEN_K_USDC);
  await usdc.mint(bob.address, TEN_K_USDC); // Not KYC'd

  return {
    vault, compliance, router, usdc,
    owner, operator, guardian, user1, user2, alice, bob,
    feeRecipient, partnerRecipient,
    OPERATOR_ROLE, COMPLIANCE_WRITE,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
//  GENESIS VAULT TESTS
// ═════════════════════════════════════════════════════════════════════════════

describe("GenesisVault", () => {

  // ─── DEPLOYMENT ────────────────────────────────────────────────────────────
  describe("Deployment", () => {
    it("deploys with correct asset, router, and compliance addresses", async () => {
      const { vault, usdc, router, compliance } = await loadFixture(deployGenesisFixture);
      expect(await vault.asset()).to.equal(usdc.address);
      expect(await vault.strategyRouter()).to.equal(router.address);
      expect(await vault.complianceRegistry()).to.equal(compliance.address);
    });

    it("sets correct platform and partner fee BPS", async () => {
      const { vault } = await loadFixture(deployGenesisFixture);
      expect(await vault.PLATFORM_FEE_BPS()).to.equal(150); // 1.5%
      expect(await vault.PARTNER_FEE_BPS()).to.equal(100);  // 1.0%
    });

    it("starts with zero totalAssets", async () => {
      const { vault } = await loadFixture(deployGenesisFixture);
      expect(await vault.totalAssets()).to.equal(0);
    });
  });

  // ─── ACCOUNT MANAGEMENT ────────────────────────────────────────────────────
  describe("Account Management", () => {
    it("activates account with correct mode and buffer BPS", async () => {
      const { vault, user1 } = await loadFixture(deployGenesisFixture);
      const policy = await vault.policies(user1.address);
      expect(policy.active).to.be.true;
      expect(policy.mode).to.equal(0);         // FlexibleReserve
      expect(policy.liquidBufferBps).to.equal(3500); // 35%
    });

    it("rejects activation for non-operator", async () => {
      const { vault, user1, user2 } = await loadFixture(deployGenesisFixture);
      await expect(
        vault.connect(user1).activateAccount(user2.address, 0, 2, 0, false)
      ).to.be.revertedWithCustomError(vault, "AccessControlUnauthorizedAccount");
    });

    it("updates treasury mode and changes buffer BPS", async () => {
      const { vault, operator, user1 } = await loadFixture(deployGenesisFixture);
      await vault.connect(operator).updateMode(user1.address, 2); // GrowthMode
      const policy = await vault.policies(user1.address);
      expect(policy.mode).to.equal(2);
      expect(policy.liquidBufferBps).to.equal(1000); // 10%
    });
  });

  // ─── DEPOSITS ──────────────────────────────────────────────────────────────
  describe("Deposit", () => {
    it("processes valid deposit and mints shares", async () => {
      const { vault, usdc, user1 } = await loadFixture(deployGenesisFixture);
      await usdc.connect(user1).approve(vault.address, THOUSAND_USDC);

      await expect(vault.connect(user1).deposit(THOUSAND_USDC, user1.address))
        .to.emit(vault, "DepositProcessed");

      const shares = await vault.balanceOf(user1.address);
      expect(shares).to.be.gt(0);
      expect(await vault.totalAssets()).to.equal(THOUSAND_USDC);
    });

    it("splits deposit between liquid buffer and deployment", async () => {
      const { vault, usdc, user1 } = await loadFixture(deployGenesisFixture);
      await usdc.connect(user1).approve(vault.address, THOUSAND_USDC);
      await vault.connect(user1).deposit(THOUSAND_USDC, user1.address);

      const liquidBuffer = await vault.liquidBuffer();
      const deployed     = await vault.deployedAssets();

      // FlexibleReserve = 35% liquid, 65% deployed
      expect(liquidBuffer).to.equal(THOUSAND_USDC.mul(35).div(100));
      expect(deployed).to.equal(THOUSAND_USDC.mul(65).div(100));
    });

    it("rejects deposit for inactive account", async () => {
      const { vault, usdc, bob } = await loadFixture(deployGenesisFixture);
      await usdc.connect(bob).approve(vault.address, THOUSAND_USDC);
      await expect(
        vault.connect(bob).deposit(THOUSAND_USDC, bob.address)
      ).to.be.revertedWithCustomError(vault, "AccountNotActive");
    });

    it("rejects zero deposit", async () => {
      const { vault, usdc, user1 } = await loadFixture(deployGenesisFixture);
      await usdc.connect(user1).approve(vault.address, THOUSAND_USDC);
      await expect(
        vault.connect(user1).deposit(0, user1.address)
      ).to.be.revertedWithCustomError(vault, "ZeroAmount");
    });

    it("blocks deposit for sanctioned user", async () => {
      const { vault, usdc, compliance, operator, alice } = await loadFixture(deployGenesisFixture);
      await compliance.connect(operator).updateSanctionStatus(
        alice.address, COMPLIANCE_BLOCK, ethers.utils.formatBytes32String("OFAC-SDN")
      );
      await usdc.connect(alice).approve(vault.address, THOUSAND_USDC);
      await expect(
        vault.connect(alice).deposit(THOUSAND_USDC, alice.address)
      ).to.be.revertedWithCustomError(vault, "ComplianceFailed");
    });

    it("share price is 1:1 at initialization", async () => {
      const { vault, usdc, user1 } = await loadFixture(deployGenesisFixture);
      await usdc.connect(user1).approve(vault.address, THOUSAND_USDC);
      await vault.connect(user1).deposit(THOUSAND_USDC, user1.address);
      const shares = await vault.balanceOf(user1.address);
      expect(shares).to.equal(THOUSAND_USDC); // 1:1 on first deposit
    });
  });

  // ─── RESERVE / SETTLE FLOW ─────────────────────────────────────────────────
  describe("Reserve → Finalize Flow", () => {
    async function depositAndReserve() {
      const fixture = await loadFixture(deployGenesisFixture);
      const { vault, usdc, operator, user1 } = fixture;
      await usdc.connect(user1).approve(vault.address, TEN_K_USDC);
      await vault.connect(user1).deposit(TEN_K_USDC, user1.address);
      const expiry = (await time.latest()) + 300;
      const orderId = ethers.utils.formatBytes32String("order-001");
      const tx = await vault.connect(operator).reserveFunds(
        user1.address, THOUSAND_USDC, expiry, orderId
      );
      const receipt = await tx.wait();
      const event   = receipt.events?.find((e: any) => e.event === "FundsReserved");
      const reservationId = event?.args?.reservationId;
      return { ...fixture, reservationId, expiry };
    }

    it("reserves funds and moves to reservedForPayouts", async () => {
      const { vault, reservationId } = await depositAndReserve();
      expect(reservationId).to.not.be.undefined;
      expect(await vault.reservedForPayouts()).to.equal(THOUSAND_USDC);
    });

    it("reduces liquidBuffer on reservation", async () => {
      const { vault } = await depositAndReserve();
      const liquidBuffer = await vault.liquidBuffer();
      // Started at 35% of 10K = 3500 USDC, reserved 1000
      expect(liquidBuffer).to.equal(
        TEN_K_USDC.mul(35).div(100).sub(THOUSAND_USDC)
      );
    });

    it("finalizes reservation and burns shares correctly", async () => {
      const { vault, operator, user1, reservationId } = await depositAndReserve();
      const platformFee = ethers.utils.parseUnits("15", USDC_DECIMALS);  // 1.5%
      const partnerFee  = ethers.utils.parseUnits("10", USDC_DECIMALS);  // 1.0%
      const ledgerId    = ethers.utils.formatBytes32String("ledger-001");

      const sharesBefore = await vault.balanceOf(user1.address);
      await vault.connect(operator).finalizeReservation(
        reservationId, platformFee, partnerFee, ledgerId
      );
      const sharesAfter = await vault.balanceOf(user1.address);
      expect(sharesAfter).to.be.lt(sharesBefore);
    });

    it("releases reservation back to liquidBuffer on cancellation", async () => {
      const { vault, operator, reservationId } = await depositAndReserve();
      const bufferBefore = await vault.liquidBuffer();
      await vault.connect(operator).releaseReservation(reservationId);
      const bufferAfter  = await vault.liquidBuffer();
      expect(bufferAfter).to.equal(bufferBefore.add(THOUSAND_USDC));
    });

    it("reverts on unknown reservation ID", async () => {
      const { vault, operator } = await loadFixture(deployGenesisFixture);
      const fakeId = ethers.utils.formatBytes32String("fake-id");
      await expect(
        vault.connect(operator).releaseReservation(fakeId)
      ).to.be.revertedWithCustomError(vault, "ReservationNotFound");
    });

    it("reverts if reservation exceeds max single tx BPS", async () => {
      const { vault, usdc, operator, user1 } = await loadFixture(deployGenesisFixture);
      await usdc.connect(user1).approve(vault.address, TEN_K_USDC);
      await vault.connect(user1).deposit(TEN_K_USDC, user1.address);
      // Try to reserve 20% — max is 10%
      const overLimit = TEN_K_USDC.mul(20).div(100);
      await expect(
        vault.connect(operator).reserveFunds(
          user1.address, overLimit,
          (await time.latest()) + 300,
          ethers.utils.formatBytes32String("big-order")
        )
      ).to.be.revertedWithCustomError(vault, "ExceedsMaxSingleTransaction");
    });
  });

  // ─── DIRECT WITHDRAW DISABLED ─────────────────────────────────────────────
  describe("ERC-4626 Overrides", () => {
    it("reverts direct withdraw()", async () => {
      const { vault, user1 } = await loadFixture(deployGenesisFixture);
      await expect(
        vault.connect(user1).withdraw(THOUSAND_USDC, user1.address, user1.address)
      ).to.be.revertedWith("Use reserveFunds → finalizeReservation");
    });

    it("reverts direct redeem()", async () => {
      const { vault, user1 } = await loadFixture(deployGenesisFixture);
      await expect(
        vault.connect(user1).redeem(THOUSAND_USDC, user1.address, user1.address)
      ).to.be.revertedWith("Use reserveFunds → finalizeReservation");
    });
  });

  // ─── YIELD REPORTING ──────────────────────────────────────────────────────
  describe("Yield Reporting", () => {
    it("increases totalAssets when yield is reported", async () => {
      const { vault, usdc, operator, user1 } = await loadFixture(deployGenesisFixture);
      await usdc.connect(user1).approve(vault.address, TEN_K_USDC);
      await vault.connect(user1).deposit(TEN_K_USDC, user1.address);

      const totalBefore = await vault.totalAssets();
      const yieldAmount = ethers.utils.parseUnits("100", USDC_DECIMALS);
      // Simulate yield arriving in vault contract
      await usdc.mint(vault.address, yieldAmount);
      await vault.connect(operator).reportYield(yieldAmount);

      expect(await vault.totalAssets()).to.equal(totalBefore.add(yieldAmount));
    });

    it("share price increases after yield without new shares minted", async () => {
      const { vault, usdc, operator, user1, user2 } = await loadFixture(deployGenesisFixture);

      // User1 deposits
      await usdc.connect(user1).approve(vault.address, TEN_K_USDC);
      await vault.connect(user1).deposit(TEN_K_USDC, user1.address);
      const sharesBefore = await vault.totalSupply();

      // Report yield
      const yieldAmount = ethers.utils.parseUnits("1000", USDC_DECIMALS);
      await usdc.mint(vault.address, yieldAmount);
      await vault.connect(operator).reportYield(yieldAmount);

      // Total supply should NOT have changed — share price increased instead
      expect(await vault.totalSupply()).to.equal(sharesBefore);
      // But converting 1 share now gives more USDC
      const assetsPerShare = await vault.convertToAssets(ONE_USDC);
      expect(assetsPerShare).to.be.gt(ONE_USDC);
    });
  });

  // ─── EMERGENCY CONTROLS ───────────────────────────────────────────────────
  describe("Emergency Controls", () => {
    it("guardian can pause the vault", async () => {
      const { vault, owner } = await loadFixture(deployGenesisFixture);
      const GUARDIAN_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("GUARDIAN_ROLE"));
      await vault.grantRole(GUARDIAN_ROLE, owner.address);
      await vault.connect(owner).emergencyPause("Test pause");
      expect(await vault.paused()).to.be.true;
    });

    it("deposit reverts when paused", async () => {
      const { vault, usdc, owner, user1 } = await loadFixture(deployGenesisFixture);
      const GUARDIAN_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("GUARDIAN_ROLE"));
      await vault.grantRole(GUARDIAN_ROLE, owner.address);
      await vault.connect(owner).emergencyPause("Emergency");
      await usdc.connect(user1).approve(vault.address, THOUSAND_USDC);
      await expect(
        vault.connect(user1).deposit(THOUSAND_USDC, user1.address)
      ).to.be.revertedWithCustomError(vault, "EnforcedPause");
    });
  });

  // ─── FEE COLLECTION ───────────────────────────────────────────────────────
  describe("Fee Collection", () => {
    it("collects platform and partner fees proportional to time", async () => {
      const { vault, usdc, operator, user1, feeRecipient, partnerRecipient } =
        await loadFixture(deployGenesisFixture);

      await usdc.connect(user1).approve(vault.address, TEN_K_USDC);
      await vault.connect(user1).deposit(TEN_K_USDC, user1.address);

      // Advance time by 1 year
      await time.increase(365 * ONE_DAY);

      const feeRecBefore    = await usdc.balanceOf(feeRecipient.address);
      const partnerRecBefore = await usdc.balanceOf(partnerRecipient.address);

      // Add USDC to vault to cover fees (simulating yield)
      await usdc.mint(vault.address, ethers.utils.parseUnits("500", USDC_DECIMALS));
      await vault.connect(operator).collectFees();

      const feeRecAfter     = await usdc.balanceOf(feeRecipient.address);
      const partnerRecAfter = await usdc.balanceOf(partnerRecipient.address);

      // Platform fee: 1.5% of 10K = $150/yr. Partner: 1.0% = $100/yr.
      expect(feeRecAfter.sub(feeRecBefore)).to.be.closeTo(
        ethers.utils.parseUnits("150", USDC_DECIMALS),
        ethers.utils.parseUnits("5", USDC_DECIMALS) // 5 USDC tolerance
      );
      expect(partnerRecAfter.sub(partnerRecBefore)).to.be.closeTo(
        ethers.utils.parseUnits("100", USDC_DECIMALS),
        ethers.utils.parseUnits("5", USDC_DECIMALS)
      );
    });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  COMPLIANCE REGISTRY TESTS
// ═════════════════════════════════════════════════════════════════════════════

describe("ComplianceRegistry", () => {
  describe("Account Activation", () => {
    it("activates account with correct KYC level", async () => {
      const { compliance, operator, user1 } = await loadFixture(deployGenesisFixture);
      const record = await compliance.records(user1.address);
      expect(record.active).to.be.true;
      expect(record.kycLevel).to.equal(2);
      expect(record.sanctionStatus).to.equal(COMPLIANCE_PASS);
    });

    it("blocks activation for OFAC-sanctioned jurisdiction", async () => {
      const { compliance, operator, bob } = await loadFixture(deployGenesisFixture);
      const expiry = (await time.latest()) + ONE_DAY * 365;
      await expect(
        compliance.connect(operator).activateAccount(
          bob.address, 2, 1, "KP", false, expiry,   // North Korea
          ethers.utils.formatBytes32String("kyc"),
          ethers.utils.formatBytes32String("aml")
        )
      ).to.be.revertedWith("Jurisdiction not supported");
    });
  });

  describe("Sanction Screening", () => {
    it("blocks account when sanction result is BLOCKED", async () => {
      const { compliance, operator, user1 } = await loadFixture(deployGenesisFixture);
      await compliance.connect(operator).updateSanctionStatus(
        user1.address,
        COMPLIANCE_BLOCK,
        ethers.utils.formatBytes32String("OFAC-SDN")
      );
      const record = await compliance.records(user1.address);
      expect(record.sanctionStatus).to.equal(COMPLIANCE_BLOCK);
      expect(record.active).to.be.false;
    });

    it("deposit screening returns BLOCKED for sanctioned account", async () => {
      const { compliance, operator, user1 } = await loadFixture(deployGenesisFixture);
      await compliance.connect(operator).updateSanctionStatus(
        user1.address, COMPLIANCE_BLOCK, ethers.utils.formatBytes32String("test")
      );
      const result = await compliance.callStatic.screenDeposit(user1.address, THOUSAND_USDC);
      expect(result).to.equal(COMPLIANCE_BLOCK);
    });
  });

  describe("Travel Rule", () => {
    it("submits travel rule record successfully", async () => {
      const { compliance, operator, user1, user2 } = await loadFixture(deployGenesisFixture);
      const orderId = ethers.utils.formatBytes32String("order-tr-001");

      await compliance.connect(operator).submitTravelRule(
        orderId, user1.address, user2.address,
        "Anthony Beedles", "Santos Family",
        "Genesis Reserve", "BPI Philippines",
        ethers.utils.parseUnits("5000", USDC_DECIMALS)
      );

      const record = await compliance.travelRuleRecords(orderId);
      expect(record.submitted).to.be.true;
      expect(record.originatorName).to.equal("Anthony Beedles");
    });
  });

  describe("Jurisdiction Gates", () => {
    it("allows US, PH, NG, IN, MX corridors", async () => {
      const { compliance } = await loadFixture(deployGenesisFixture);
      for (const iso of ["US", "PH", "NG", "IN", "MX"]) {
        const config = await compliance.jurisdictions(iso);
        expect(config.allowed).to.be.true;
      }
    });

    it("blocks KP, IR, RU (OFAC sanctioned)", async () => {
      const { compliance } = await loadFixture(deployGenesisFixture);
      for (const iso of ["KP", "IR", "RU"]) {
        const config = await compliance.jurisdictions(iso);
        expect(config.allowed).to.be.false;
      }
    });
  });

  describe("Daily Limits", () => {
    it("enforces daily limit by KYC tier", async () => {
      const { compliance, user1 } = await loadFixture(deployGenesisFixture);
      const remaining = await compliance.getDailyRemaining(user1.address);
      // KYC level 2 = $9,500 daily limit
      expect(remaining).to.equal(ethers.utils.parseUnits("9500", USDC_DECIMALS));
    });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  RECONCILIATION INVARIANT (run against every vault state)
// ═════════════════════════════════════════════════════════════════════════════

describe("Reconciliation Invariant", () => {
  it("totalAssets() always equals liquidBuffer + deployedAssets + reservedForPayouts", async () => {
    const { vault, usdc, operator, user1 } = await loadFixture(deployGenesisFixture);

    // After deployment
    let [total, liquid, deployed, reserved] = await Promise.all([
      vault.totalAssets(), vault.liquidBuffer(), vault.deployedAssets(), vault.reservedForPayouts()
    ]);
    expect(total).to.equal(liquid.add(deployed).add(reserved));

    // After deposit
    await usdc.connect(user1).approve(vault.address, TEN_K_USDC);
    await vault.connect(user1).deposit(TEN_K_USDC, user1.address);
    [total, liquid, deployed, reserved] = await Promise.all([
      vault.totalAssets(), vault.liquidBuffer(), vault.deployedAssets(), vault.reservedForPayouts()
    ]);
    expect(total).to.equal(liquid.add(deployed).add(reserved));

    // After reservation
    const orderId = ethers.utils.formatBytes32String("recon-test");
    await vault.connect(operator).reserveFunds(
      user1.address, THOUSAND_USDC, (await time.latest()) + 300, orderId
    );
    [total, liquid, deployed, reserved] = await Promise.all([
      vault.totalAssets(), vault.liquidBuffer(), vault.deployedAssets(), vault.reservedForPayouts()
    ]);
    expect(total).to.equal(liquid.add(deployed).add(reserved));
  });
});
